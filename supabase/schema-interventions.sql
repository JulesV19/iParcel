-- ============================================================
-- Interventions -- à exécuter dans l'éditeur SQL Supabase
-- ============================================================

-- 1. Produits phytosanitaires (e-phy ANSES)
--    Remplie via scripts/import-ephy.mjs
create table if not exists produits_phyto (
  id             uuid primary key default gen_random_uuid(),
  amm            text unique not null,
  nom_commercial text not null,
  titulaire      text,
  type_produit   text,
  statut         text,
  date_amm       date,
  date_retrait   date,
  created_at     timestamptz default now()
);

alter table produits_phyto enable row level security;

create policy "authenticated_read_produits_phyto" on produits_phyto
  for select using (auth.uid() is not null);

create index if not exists idx_produits_phyto_nom
  on produits_phyto using gin(to_tsvector('french', nom_commercial));
create index if not exists idx_produits_phyto_amm
  on produits_phyto(amm);

-- 2. Table unique des interventions
create table if not exists interventions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users not null,
  parcel_id          uuid references parcels(id) on delete cascade not null,

  -- Champs communs
  category           text not null check (
    category in ('travail_sol','semis','fertilisation','traitement_phyto',
                 'irrigation','recolte','observation','autre')
  ),
  sub_type           text,
  date               date not null default current_date,
  culture            text,
  stade_bbch         text,
  operateur          text,
  materiel           text,
  surface_ha         numeric,

  -- Météo
  meteo_auto         boolean default false,
  meteo_temperature  numeric,
  meteo_vent_vitesse numeric,
  meteo_humidite     numeric,
  meteo_conditions   text,

  commentaire        text,

  -- Traitement phytosanitaire
  phyto_produit_id   uuid references produits_phyto(id),
  phyto_produit_nom  text,
  phyto_amm          text,
  phyto_cible        text,
  phyto_dose_value   numeric,
  phyto_dose_unit    text,
  phyto_volume_bouillie numeric,

  -- Fertilisation
  ferti_produit      text,
  ferti_dose_value   numeric,
  ferti_dose_unit    text,
  ferti_n_pct        numeric,
  ferti_p_pct        numeric,
  ferti_k_pct        numeric,

  -- Semis
  semis_variete      text,
  semis_densite_value numeric,
  semis_densite_unit  text,
  semis_profondeur_cm numeric,

  -- Récolte
  recolte_rendement_value numeric,
  recolte_rendement_unit  text,
  recolte_humidite_pct    numeric,
  recolte_destination     text,

  -- Irrigation
  irrig_volume_mm    numeric,
  irrig_duree_h      numeric,

  created_at         timestamptz default now()
);

alter table interventions enable row level security;

create policy "users_own_interventions" on interventions
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists idx_interventions_parcel
  on interventions(parcel_id);
create index if not exists idx_interventions_date
  on interventions(date desc);

-- ============================================================
-- Étape 12 — Conformité fertilisation e-phy MFSC
-- ============================================================

-- 3. Produits MFSC (matières fertilisantes et supports de culture)
--    Remplie via scripts/import-mfsc.mjs
create table if not exists produits_mfsc (
  id           bigint generated always as identity primary key,
  amm          text unique not null,
  nom_produit  text not null,
  type_produit text -- "MFSC" ou "PRODUIT-MIXTE"
);

alter table produits_mfsc enable row level security;

create policy "authenticated_read_produits_mfsc" on produits_mfsc
  for select using (auth.uid() is not null);

create index if not exists idx_produits_mfsc_nom
  on produits_mfsc(nom_produit);
create index if not exists idx_produits_mfsc_amm
  on produits_mfsc(amm);

-- 4. Usages MFSC
--    Remplie via scripts/import-usages-mfsc.mjs
create table if not exists usages_mfsc (
  id               bigint generated always as identity primary key,
  amm              text not null,
  nom_produit      text,
  type_culture     text not null,
  dose_min         numeric,
  dose_min_unite   text,
  dose_max         numeric,
  dose_max_unite   text,
  etat_usage       text not null,
  culture_commentaire text
);

alter table usages_mfsc enable row level security;

create policy "authenticated_read_usages_mfsc" on usages_mfsc
  for select using (auth.uid() is not null);

create index if not exists idx_usages_mfsc_amm_culture
  on usages_mfsc(amm, type_culture);

-- 5. Colonne ferti_amm sur interventions (migration)
alter table interventions
  add column if not exists ferti_amm text;
