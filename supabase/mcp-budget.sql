-- Migration : budget de calcul du serveur MCP (quotas pondérés, plafond commun, temps CPU, cache)
-- Date : 2026-10-25
-- Raison : sur le plan gratuit de Vercel, tout le projet dispose de 4 h de CPU par mois ; un
-- dépassement suspend le projet, app web comprise, jusqu'à 30 jours. Un calcul d'indice coûte
-- environ 1 s de CPU. Les séries (plusieurs dates par appel) doivent compter pour leur nombre de
-- dates, et un plafond commun à tous les comptes protège le budget.
-- - weight : unités du quota général (1 par appel, plus pour la météo sur une longue période)
-- - heavy_units : calculs d'indice réellement effectués (0 si le résultat vient du cache)
-- - cpu_ms : temps CPU mesuré par le serveur, pour ajuster les plafonds sur des chiffres réels
-- - mcp_index_cache : résultats de calcul réutilisés pendant 90 jours
-- Comme pour le journal, user_id et client_id sont lus dans le jeton signé, jamais dans les
-- paramètres ; une application qui appellerait ces fonctions directement ne peut qu'agir sur
-- son propre compte.
-- À exécuter dans l'éditeur SQL Supabase après oauth-revocation.sql, AVANT de déployer le code :
-- l'ancien code appelle des fonctions que cette migration remplace.

begin;

-- ─── Journal : unités pondérées et temps CPU ─────────────────────────────────

alter table mcp_audit
  add column weight smallint not null default 1 check (weight between 1 and 100),
  add column heavy_units smallint not null default 0 check (heavy_units between 0 and 100),
  add column cpu_ms integer check (cpu_ms >= 0);

update mcp_audit set heavy_units = 1 where heavy;
alter table mcp_audit drop column heavy;

drop function mcp_begin_call(text, uuid, boolean);
drop function mcp_end_call(bigint, boolean);

-- Enregistre un appel et renvoie son id, ou null si le quota général du compte est atteint
create function mcp_begin_call(p_tool text, p_parcel_id uuid, p_weight int default 1)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cid text := auth.jwt() ->> 'client_id';
  per_minute int;
  per_day int;
  call_id bigint;
begin
  if uid is null or coalesce(cid, '') = '' then
    raise exception 'Réservé aux applications connectées.' using errcode = '42501';
  end if;
  if not public.oauth_grant_active() then
    raise exception 'Accès retiré par l''utilisateur.' using errcode = '42501';
  end if;
  if p_weight is null or p_weight not between 1 and 100 then
    raise exception 'Poids invalide.' using errcode = '22023';
  end if;

  -- Sérialise les appels d'un même compte : des requêtes parallèles ne dépassent pas le quota
  perform pg_advisory_xact_lock(hashtext('mcp_audit:' || uid::text));

  select
    coalesce(sum(weight) filter (where created_at > now() - interval '1 minute'), 0),
    coalesce(sum(weight), 0)
  into per_minute, per_day
  from mcp_audit
  where user_id = uid and status <> 'rate_limited' and created_at > now() - interval '1 day';

  if per_minute + p_weight > 60 or per_day + p_weight > 1000 then
    -- Un seul refus tracé par minute : un client qui insiste ne remplit pas la table
    if not exists (
      select 1 from mcp_audit
      where user_id = uid and status = 'rate_limited' and created_at > now() - interval '1 minute'
    ) then
      insert into mcp_audit (user_id, client_id, tool, parcel_id, status)
      values (uid, cid::uuid, p_tool, p_parcel_id, 'rate_limited');
    end if;
    return null;
  end if;

  insert into mcp_audit (user_id, client_id, tool, parcel_id, weight, status)
  values (uid, cid::uuid, p_tool, p_parcel_id, p_weight, 'pending')
  returning id into call_id;
  return call_id;
end;
$$;

-- Réserve des calculs d'indice pour un appel en cours.
-- Renvoie 0 si accepté, 1 si le quota du compte est atteint, 2 si le plafond commun l'est.
-- Ne fait qu'augmenter heavy_units : impossible de s'en servir pour contourner un quota.
create function mcp_reserve_heavy(p_id bigint, p_units int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cid text := auth.jwt() ->> 'client_id';
  user_minute int;
  user_day int;
  all_day int;
begin
  if uid is null or coalesce(cid, '') = '' then
    raise exception 'Réservé aux applications connectées.' using errcode = '42501';
  end if;
  if p_units is null or p_units not between 1 and 100 then
    raise exception 'Nombre de calculs invalide.' using errcode = '22023';
  end if;

  -- Toujours le verrou du compte puis le verrou commun : pas d'interblocage
  perform pg_advisory_xact_lock(hashtext('mcp_audit:' || uid::text));
  if not exists (
    select 1 from mcp_audit
    where id = p_id and user_id = uid and client_id::text = cid and status = 'pending'
  ) then
    raise exception 'Appel inconnu.' using errcode = '22023';
  end if;

  select
    coalesce(sum(heavy_units) filter (where created_at > now() - interval '1 minute'), 0),
    coalesce(sum(heavy_units), 0)
  into user_minute, user_day
  from mcp_audit
  where user_id = uid and status <> 'rate_limited' and created_at > now() - interval '1 day';

  if user_minute + p_units > 20 or user_day + p_units > 60 then
    update mcp_audit set status = 'rate_limited' where id = p_id;
    return 1;
  end if;

  perform pg_advisory_xact_lock(hashtext('mcp_audit:global'));
  select coalesce(sum(heavy_units), 0) into all_day
  from mcp_audit
  where heavy_units > 0 and status <> 'rate_limited' and created_at > now() - interval '1 day';

  if all_day + p_units > 250 then
    update mcp_audit set status = 'rate_limited' where id = p_id;
    return 2;
  end if;

  update mcp_audit set heavy_units = heavy_units + p_units where id = p_id;
  return 0;
end;
$$;

create function mcp_end_call(p_id bigint, p_ok boolean, p_cpu_ms int default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update mcp_audit
  set status = case when p_ok then 'ok' else 'error' end,
      cpu_ms = greatest(0, p_cpu_ms)
  where id = p_id
    and user_id = auth.uid()
    and client_id::text = auth.jwt() ->> 'client_id'
    and status = 'pending';
end;
$$;

revoke execute on function mcp_begin_call(text, uuid, int) from public, anon;
revoke execute on function mcp_reserve_heavy(bigint, int) from public, anon;
revoke execute on function mcp_end_call(bigint, boolean, int) from public, anon;
grant execute on function mcp_begin_call(text, uuid, int) to authenticated;
grant execute on function mcp_reserve_heavy(bigint, int) to authenticated;
grant execute on function mcp_end_call(bigint, boolean, int) to authenticated;

-- ─── Cache des indices ───────────────────────────────────────────────────────

create table mcp_index_cache (
  -- Suppression du compte ou de la parcelle : ses résultats partent avec elle
  user_id uuid not null references auth.users (id) on delete cascade,
  parcel_id uuid not null references parcels (id) on delete cascade,
  -- SHA-256 du contour et de la version du calcul : un contour modifié ne réutilise rien
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  item_id text not null check (item_id ~ '^[A-Za-z0-9_]{1,80}$'),
  spectral_index text not null check (spectral_index in ('NDVI', 'NDWI', 'NDMI')),
  result jsonb not null check (jsonb_typeof(result) = 'object' and pg_column_size(result) <= 8192),
  created_at timestamptz not null default now(),
  primary key (parcel_id, input_hash, item_id, spectral_index)
);

create index mcp_index_cache_user_idx on mcp_index_cache (user_id);
create index mcp_index_cache_created_idx on mcp_index_cache (created_at);

-- Aucun accès direct : lecture et écriture passent par les deux fonctions ci-dessous
alter table mcp_index_cache enable row level security;
revoke all on mcp_index_cache from anon, authenticated;

create function mcp_cache_get(p_parcel_id uuid, p_input_hash text, p_index text, p_item_ids text[])
returns table (item_id text, result jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or coalesce(auth.jwt() ->> 'client_id', '') = '' then
    raise exception 'Réservé aux applications connectées.' using errcode = '42501';
  end if;
  if not public.oauth_grant_active() then
    raise exception 'Accès retiré par l''utilisateur.' using errcode = '42501';
  end if;
  return query
    select c.item_id, c.result from mcp_index_cache c
    where c.user_id = auth.uid()
      and c.parcel_id = p_parcel_id
      and c.input_hash = p_input_hash
      and c.spectral_index = p_index
      and c.item_id = any (p_item_ids[1:100])
      and c.created_at > now() - interval '90 days';
end;
$$;

create function mcp_cache_put(p_parcel_id uuid, p_input_hash text, p_index text, p_item_id text, p_result jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or coalesce(auth.jwt() ->> 'client_id', '') = '' then
    raise exception 'Réservé aux applications connectées.' using errcode = '42501';
  end if;
  if not public.oauth_grant_active() then
    raise exception 'Accès retiré par l''utilisateur.' using errcode = '42501';
  end if;
  if not exists (select 1 from parcels where id = p_parcel_id and user_id = uid) then
    return;
  end if;
  -- Au plus 3 000 résultats par compte (environ 10 Mo) : le cache ne peut pas remplir la base
  if (select count(*) from mcp_index_cache where user_id = uid) >= 3000 then
    return;
  end if;
  insert into mcp_index_cache (user_id, parcel_id, input_hash, item_id, spectral_index, result)
  values (uid, p_parcel_id, p_input_hash, p_item_id, p_index, p_result)
  on conflict (parcel_id, input_hash, item_id, spectral_index)
  do update set result = excluded.result, created_at = now();
end;
$$;

revoke execute on function mcp_cache_get(uuid, text, text, text[]) from public, anon;
revoke execute on function mcp_cache_put(uuid, text, text, text, jsonb) from public, anon;
grant execute on function mcp_cache_get(uuid, text, text, text[]) to authenticated;
grant execute on function mcp_cache_put(uuid, text, text, text, jsonb) to authenticated;

commit;

-- Purge quotidienne du cache (90 jours), à lancer après la migration, comme celle du journal :
-- select cron.schedule('mcp-cache-purge', '27 3 * * *', $$delete from public.mcp_index_cache where created_at < now() - interval '90 days'$$);

-- Contrôle (à lancer seul) : simule une application connectée, tout est annulé à la fin.
-- Remplacer <USER_ID> par l'id d'un compte et <OAUTH_SID> par l'id d'une session OAuth active
-- (select id from auth.sessions where user_id = '<USER_ID>' and oauth_client_id is not null).
--
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims', '{"sub":"<USER_ID>","role":"authenticated","client_id":"7fd549fb-94d8-4fea-9153-07e1ef1d763d","oauth_sid":"<OAUTH_SID>"}', true);
-- select mcp_reserve_heavy(mcp_begin_call('get_vegetation_series', null), 6) as serie_6;    -- attendu : 0
-- select mcp_reserve_heavy(mcp_begin_call('get_vegetation_series', null), 60) as serie_60;  -- attendu : 1
-- select tool, weight, heavy_units, status from mcp_audit where created_at > now() - interval '1 minute' order by id;
-- rollback;
