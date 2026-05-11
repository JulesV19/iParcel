-- Migration: suppression de la table notes
-- Date: 2026-05-11
-- Raison: fonctionnalité notes retirée de l'application

-- Sauvegarder les données avant suppression (optionnel, commenter si non souhaité)
-- CREATE TABLE notes_backup AS SELECT * FROM notes;

-- Supprimer la table
DROP TABLE IF EXISTS notes;
