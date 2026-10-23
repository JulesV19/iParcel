-- Migration : limites côté base sur les parcelles
-- Date : 2026-10-23
-- Raison : maxLength et la validation du navigateur se contournent en appelant l'API Supabase
-- directement. Sans ces règles, un compte peut remplir la base ou enregistrer une géométrie
-- qui fait planter l'affichage.
-- À exécuter dans l'éditeur SQL Supabase. Si une parcelle existante ne respecte pas une règle,
-- rien n'est modifié : la requête de contrôle en fin de fichier liste les parcelles en cause.

begin;

alter table parcels
  add constraint parcels_name_length check (char_length(btrim(name)) between 1 and 80),
  add constraint parcels_geometry_size check (pg_column_size(geometry) <= 65536),
  -- Un seul anneau fermé de 4 à 1000 sommets [lon, lat] ; coalesce car un CHECK à NULL est accepté
  add constraint parcels_geometry_polygon check (coalesce(
    jsonb_typeof(geometry) = 'object'
    and geometry->>'type' = 'Polygon'
    and jsonb_typeof(geometry->'coordinates') = 'array'
    and jsonb_array_length(geometry->'coordinates') = 1
    and jsonb_typeof(geometry->'coordinates'->0) = 'array'
    and jsonb_array_length(geometry->'coordinates'->0) between 4 and 1000
    and geometry->'coordinates'->0->0 = geometry->'coordinates'->0->-1
    and not jsonb_path_exists(
      geometry,
      'strict $.coordinates[0][*] ? (@.type() != "array" || @.size() != 2 || @[0].type() != "number" || @[1].type() != "number" || @[0] < -180 || @[0] > 180 || @[1] < -90 || @[1] > 90)',
      '{}', true
    ),
    false
  ));

create index if not exists parcels_user_id_idx on parcels (user_id);

-- 200 parcelles par compte au plus ; le message est affiché tel quel dans l'app (code P0001)
create or replace function parcels_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Sérialise les insertions d'un même compte pour que des requêtes parallèles ne dépassent pas la limite
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));
  if (select count(*) from parcels where user_id = new.user_id) >= 200 then
    raise exception 'Limite de 200 parcelles atteinte. Supprimez-en une avant d''en ajouter.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists parcels_limit on parcels;
create trigger parcels_limit
  before insert on parcels
  for each row execute function parcels_limit();

-- Seul un utilisateur connecté peut appeler la suppression de compte
revoke execute on function delete_user() from public, anon;
grant execute on function delete_user() to authenticated;

commit;

-- Contrôle (à lancer seul si la migration échoue) : parcelles qui ne respectent pas les règles
-- select id, user_id, name, pg_column_size(geometry) as taille, geometry->>'type' as type
-- from parcels
-- where char_length(btrim(name)) not between 1 and 80
--    or pg_column_size(geometry) > 65536
--    or geometry->>'type' is distinct from 'Polygon'
--    or jsonb_typeof(geometry->'coordinates') is distinct from 'array';
