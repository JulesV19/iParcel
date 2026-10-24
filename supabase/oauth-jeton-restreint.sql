-- Migration : jetons OAuth restreints (Custom Access Token Hook)
-- Date : 2026-10-23
-- Raison : l'API Auth de Supabase accepte un jeton OAuth comme une session normale : une IA
-- (ou quiconque vole son jeton) pourrait changer le mot de passe, ajouter une passkey ou un
-- facteur MFA, ou approuver l'accès d'autres applications. Aucun réglage Supabase ne l'empêche.
-- L'API Auth retrouve la session à partir de la claim session_id et refuse la requête si elle
-- n'existe pas (403 session_not_found). La RLS, elle, ne lit pas session_id : la lecture des
-- parcelles continue de fonctionner. Le renouvellement du jeton passe par le refresh token,
-- rattaché à la vraie session : il n'est pas affecté.
-- Comportement interne de Supabase Auth (internal/api/auth.go, maybeLoadUserOrSession), non
-- documenté : à revérifier avec scripts/oauth-e2e.mjs après chaque mise à jour de Supabase.
--
-- Après exécution : Authentication → Hooks → Customize Access Token (JWT) Claims hook,
-- type Postgres, schéma public, fonction custom_access_token_hook.
-- Une erreur dans cette fonction bloque toutes les connexions, app web comprise : se connecter
-- à l'app juste après l'activation. En cas de problème, désactiver le hook dans le dashboard.

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

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;

commit;

-- Contrôle (à lancer seul) : la première ligne doit être modifiée, la seconde inchangée.
-- select public.custom_access_token_hook('{"claims":{"sub":"x","session_id":"11111111-1111-1111-1111-111111111111","email":"a@b.fr","phone":"","user_metadata":{"k":1},"client_id":"c"}}')
-- union all
-- select public.custom_access_token_hook('{"claims":{"sub":"x","session_id":"11111111-1111-1111-1111-111111111111","email":"a@b.fr","phone":"","user_metadata":{"k":1}}}');
