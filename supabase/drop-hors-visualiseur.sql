-- Migration : suppression des tables hors visualiseur de parcelles
-- Date : 2026-10-20
-- Raison : interventions, base produits e-phy et notes retirées de l'application.
-- À exécuter dans l'éditeur SQL Supabase. Irréversible : faire une sauvegarde avant.
--
-- Après exécution, désactiver le workflow GitHub Actions du dépôt
-- -iParcel-ephy-database-update, qui écrit dans les tables produits/usages.
--
-- Conservé : parcels, la fonction delete_user() et les comptes (auth.users).

begin;

-- interventions référence produits_phyto : la supprimer en premier
drop table if exists interventions;
drop table if exists usages_phyto;
drop table if exists produits_phyto;
drop table if exists usages_mfsc;
drop table if exists produits_mfsc;
drop table if exists notes;

commit;
