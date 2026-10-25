-- Migration : journal d'audit de Supabase Auth
-- Date : 2026-10-24
-- Raison : Supabase Auth écrit chaque connexion, inscription ou changement de mot de passe dans
-- auth.audit_log_entries (adresse IP, email), sans limite de durée. Ces lignes ne sont pas liées
-- au compte : elles restent après sa suppression. La politique de confidentialité promet des
-- journaux techniques de 90 jours au plus et un effacement à la suppression du compte.
--
-- Avant d'exécuter : Authentication → Settings → désactiver l'écriture du journal d'audit dans la
-- base. Supabase garde alors ces journaux dans sa plateforme de logs, avec la rétention du plan
-- (1 jour en gratuit). Ce fichier efface ensuite les lignes déjà écrites.
-- À exécuter dans l'éditeur SQL Supabase.

delete from auth.audit_log_entries;

-- Si l'option n'est pas désactivée, purge quotidienne à 90 jours (pg_cron, déjà activé pour
-- mcp-audit-purge) :
-- select cron.schedule('auth-audit-purge', '23 3 * * *', $$delete from auth.audit_log_entries where created_at < now() - interval '90 days'$$);

-- Contrôle (à lancer seul) : attendu 0, puis 0 après une connexion à l'app si l'option est désactivée.
-- select count(*) from auth.audit_log_entries;
