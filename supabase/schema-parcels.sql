-- Schéma de base : table des parcelles, RLS et suppression de compte
-- Date : 2026-10-24 (versionne le schéma créé au lancement, jusque-là décrit dans la doc Obsidian)
-- Raison : pouvoir reconstruire la base d'un nouveau projet Supabase à partir du dépôt.
-- À exécuter en premier sur un projet vide, puis les migrations dans l'ordre du README.
-- Ne pas exécuter sur la base de production : tout y existe déjà.
-- Les migrations suivantes complètent ce schéma : limites-parcels.sql (contraintes, index,
-- suppression en cascade), oauth-lecture-seule.sql (delete_user protégé contre les applications).

begin;

create table parcels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  geometry jsonb not null,
  created_at timestamptz default now()
);

alter table parcels enable row level security;

-- FOR ALL sans WITH CHECK : la condition s'applique aussi aux lignes insérées ou modifiées
create policy "Users see own parcels" on parcels
  for all using (auth.uid() = user_id);

create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  delete from parcels where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$function$;

commit;

-- Contrôle (à lancer seul, sur la production) : le schéma réel doit correspondre à ce fichier.
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns where table_schema = 'public' and table_name = 'parcels'
-- order by ordinal_position;
-- select policyname, permissive, cmd, qual, with_check from pg_policies where tablename = 'parcels';
