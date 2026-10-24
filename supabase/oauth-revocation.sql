-- Migration : révocation immédiate des applications connectées
-- Date : 2026-10-24
-- Raison : retirer l'accès d'une application (page « Applications connectées ») supprime ses
-- sessions et invalide son refresh token, mais son jeton d'accès reste valable jusqu'à son
-- expiration (1 h) : il continuerait à lire les parcelles via le serveur MCP ou l'API Supabase.
-- Le hook garde désormais l'id de la vraie session dans la claim oauth_sid ; chaque lecture
-- vérifie que cette session existe encore.
-- Révocation (internal/api/oauthserver/handlers.go, UserRevokeOAuthGrant) : suppression des
-- lignes de auth.sessions où oauth_client_id = l'application. Comportement interne de Supabase
-- Auth : à revérifier avec le script de test après chaque mise à jour de Supabase.
-- Les jetons délivrés avant cette migration n'ont pas de claim oauth_sid : ils sont refusés et
-- l'application doit renouveler son jeton (refresh token) ou se reconnecter.
-- À exécuter dans l'éditeur SQL Supabase, après oauth-jeton-restreint.sql et mcp-audit.sql.

begin;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  claims jsonb := event->'claims';
begin
  -- Seuls les jetons délivrés à une application OAuth portent client_id
  if coalesce(claims->>'client_id', '') <> '' then
    claims := claims || jsonb_build_object(
      -- Vraie session, lue par oauth_grant_active() ; l'API Auth ne lit que session_id
      'oauth_sid', claims->>'session_id',
      -- UUID aléatoire et non nul : l'UUID nul ferait sauter la vérification de session
      'session_id', gen_random_uuid()::text,
      -- Minimisation : le serveur MCP n'a besoin que de sub ; email et phone sont des claims
      -- obligatoires, d'où des chaînes vides
      'email', '',
      'phone', '',
      'user_metadata', '{}'::jsonb
    );
  end if;
  return jsonb_build_object('claims', claims);
end;
$$;

-- Vrai pour l'app web ; pour une application connectée, vrai tant que sa session existe
create or replace function public.oauth_grant_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'client_id', '') = ''
    or exists (
      select 1 from auth.sessions s
      where s.id::text = auth.jwt() ->> 'oauth_sid'
        and s.user_id = auth.uid()
        and s.oauth_client_id::text = auth.jwt() ->> 'client_id'
        and (s.not_after is null or s.not_after > now())
    );
$$;

revoke execute on function public.oauth_grant_active() from public;
grant execute on function public.oauth_grant_active() to anon, authenticated;

-- Combinée en ET avec « Users see own parcels » ; (select …) : évaluée une fois par requête
create policy "OAuth clients need an active grant" on parcels
  as restrictive for select to public
  using ((select public.oauth_grant_active()));

-- Même vérification avant chaque appel d'outil MCP (défense en profondeur)
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
  if not public.oauth_grant_active() then
    raise exception 'Accès retiré par l''utilisateur.' using errcode = '42501';
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

commit;

-- Contrôle (à lancer seul) : la fonction doit renvoyer true, false, false. Tout est annulé.
-- Remplacer <USER_ID> par l'id de votre compte.
--
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims', '{"sub":"<USER_ID>","role":"authenticated"}', true);
-- select 'app web' as cas, public.oauth_grant_active() as actif;
-- select set_config('request.jwt.claims', '{"sub":"<USER_ID>","role":"authenticated","client_id":"7fd549fb-94d8-4fea-9153-07e1ef1d763d","oauth_sid":"00000000-0000-4000-8000-000000000000"}', true);
-- select 'session inexistante' as cas, public.oauth_grant_active() as actif;
-- select 'parcelles lisibles' as cas, count(*) > 0 as actif from parcels;
-- rollback;
