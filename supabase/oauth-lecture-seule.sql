-- Migration : applications connectées (OAuth) en lecture seule
-- Date : 2026-10-23
-- Raison : un jeton OAuth délivré à une IA est un JWT Supabase ordinaire, reconnaissable à sa
-- claim client_id. Il donne accès à l'API Supabase sans passer par le serveur MCP : la policy
-- « Users see own parcels » (FOR ALL) lui permettrait de modifier ou supprimer des parcelles,
-- et delete_user() de supprimer le compte. Les scopes OAuth ne limitent pas l'accès à la base.
-- À exécuter dans l'éditeur SQL Supabase, avant d'activer le moindre client OAuth.

begin;

-- Policies restrictives : combinées en ET avec « Users see own parcels », la lecture reste permise
create policy "OAuth clients cannot insert parcels" on parcels
  as restrictive for insert to public
  with check ((auth.jwt() ->> 'client_id') is null);

create policy "OAuth clients cannot update parcels" on parcels
  as restrictive for update to public
  using ((auth.jwt() ->> 'client_id') is null)
  with check ((auth.jwt() ->> 'client_id') is null);

create policy "OAuth clients cannot delete parcels" on parcels
  as restrictive for delete to public
  using ((auth.jwt() ->> 'client_id') is null);

-- SECURITY DEFINER contourne la RLS : la vérification doit être faite dans la fonction
create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if (auth.jwt() ->> 'client_id') is not null then
    raise exception 'Suppression de compte impossible depuis une application connectée.'
      using errcode = '42501';
  end if;
  delete from parcels where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$function$;

revoke execute on function delete_user() from public, anon;
grant execute on function delete_user() to authenticated;

commit;

-- Contrôle (à lancer seul après la migration) : simule un jeton OAuth, rien ne doit être modifié.
-- Remplacer <USER_ID> par l'id d'un compte qui possède au moins une parcelle.
--
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims', '{"sub":"<USER_ID>","role":"authenticated","client_id":"test"}', true);
-- select count(*) as lisibles from parcels;                          -- attendu : ses parcelles
-- update parcels set name = name returning id;                       -- attendu : 0 ligne
-- delete from parcels returning id;                                  -- attendu : 0 ligne
-- select delete_user();                                              -- attendu : erreur 42501
-- rollback;
