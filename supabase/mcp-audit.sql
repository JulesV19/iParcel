-- Migration : journal d'audit et limitation de débit du serveur MCP
-- Date : 2026-10-23
-- Raison : tracer chaque appel d'outil fait par une application connectée (qui, quelle
-- application, quel outil, quelle parcelle, quand, résultat) et limiter le nombre d'appels.
-- Aucune IP ni contenu de réponse n'est conservé. Conservation : 1 an (purge quotidienne).
-- Le serveur MCP appelle mcp_begin_call puis mcp_end_call avec le jeton de l'utilisateur :
-- user_id et client_id sont lus dans le jeton signé, jamais dans les paramètres.
-- Une application qui appellerait ces fonctions directement ne peut qu'ajouter des lignes à
-- son propre nom et consommer son propre quota.
-- À exécuter dans l'éditeur SQL Supabase.

begin;

create table mcp_audit (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  -- Suppression du compte : son journal part avec lui (droit à l'effacement)
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null,
  tool text not null check (tool ~ '^[a-z_]{1,40}$'),
  -- Sans clé étrangère : la ligne reste lisible si la parcelle est supprimée ensuite
  parcel_id uuid,
  heavy boolean not null,
  status text not null check (status in ('pending', 'ok', 'error', 'rate_limited'))
);

create index mcp_audit_user_created_idx on mcp_audit (user_id, created_at desc);
create index mcp_audit_created_idx on mcp_audit (created_at);

alter table mcp_audit enable row level security;

-- Lecture de son propre journal depuis l'app web uniquement ; aucune écriture directe
create policy "Users read own MCP audit" on mcp_audit
  for select to authenticated
  using (auth.uid() = user_id and (auth.jwt() ->> 'client_id') is null);

revoke all on mcp_audit from anon, authenticated;
grant select on mcp_audit to authenticated;

-- Enregistre un appel et renvoie son id, ou null si le quota est atteint
create or replace function mcp_begin_call(p_tool text, p_parcel_id uuid, p_heavy boolean)
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
  heavy_minute int;
  heavy_day int;
  call_id bigint;
begin
  if uid is null or coalesce(cid, '') = '' then
    raise exception 'Réservé aux applications connectées.' using errcode = '42501';
  end if;

  -- Sérialise les appels d'un même compte : des requêtes parallèles ne dépassent pas le quota
  perform pg_advisory_xact_lock(hashtext('mcp_audit:' || uid::text));

  select
    count(*) filter (where created_at > now() - interval '1 minute'),
    count(*),
    count(*) filter (where heavy and created_at > now() - interval '1 minute'),
    count(*) filter (where heavy)
  into per_minute, per_day, heavy_minute, heavy_day
  from mcp_audit
  where user_id = uid and status <> 'rate_limited' and created_at > now() - interval '1 day';

  if per_minute >= 60 or per_day >= 1000 or (p_heavy and (heavy_minute >= 20 or heavy_day >= 300)) then
    -- Un seul refus tracé par minute : un client qui insiste ne remplit pas la table
    if not exists (
      select 1 from mcp_audit
      where user_id = uid and status = 'rate_limited' and created_at > now() - interval '1 minute'
    ) then
      insert into mcp_audit (user_id, client_id, tool, parcel_id, heavy, status)
      values (uid, cid::uuid, p_tool, p_parcel_id, p_heavy, 'rate_limited');
    end if;
    return null;
  end if;

  insert into mcp_audit (user_id, client_id, tool, parcel_id, heavy, status)
  values (uid, cid::uuid, p_tool, p_parcel_id, p_heavy, 'pending')
  returning id into call_id;
  return call_id;
end;
$$;

create or replace function mcp_end_call(p_id bigint, p_ok boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update mcp_audit
  set status = case when p_ok then 'ok' else 'error' end
  where id = p_id
    and user_id = auth.uid()
    and client_id::text = auth.jwt() ->> 'client_id'
    and status = 'pending';
end;
$$;

revoke execute on function mcp_begin_call(text, uuid, boolean) from public, anon;
revoke execute on function mcp_end_call(bigint, boolean) from public, anon;
grant execute on function mcp_begin_call(text, uuid, boolean) to authenticated;
grant execute on function mcp_end_call(bigint, boolean) to authenticated;

commit;

-- Purge quotidienne des lignes de plus d'un an (à lancer après la migration).
-- Si l'extension n'est pas activable en SQL : Database → Extensions → pg_cron.
-- create extension if not exists pg_cron;
-- select cron.schedule('mcp-audit-purge', '17 3 * * *', $$delete from public.mcp_audit where created_at < now() - interval '1 year'$$);

-- Contrôle (à lancer seul) : simule une application connectée, tout est annulé à la fin.
-- Remplacer <USER_ID> par l'id d'un compte.
--
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims', '{"sub":"<USER_ID>","role":"authenticated","client_id":"7fd549fb-94d8-4fea-9153-07e1ef1d763d"}', true);
-- select mcp_end_call(mcp_begin_call('list_parcels', null, false), true);
-- select count(*) filter (where mcp_begin_call('test', null, true) is not null) as acceptes_sur_25 from generate_series(1, 25);
-- select set_config('request.jwt.claims', '{"sub":"<USER_ID>","role":"authenticated"}', true);
-- select tool, heavy, status, count(*) from mcp_audit group by 1, 2, 3 order by 1, 3;
-- rollback;
--
-- Attendu : acceptes_sur_25 = 20, puis list_parcels/ok 1, test/pending 20, test/rate_limited 1.
