# iParcel

Visualiseur de parcelles agricoles. Permet de dessiner des parcelles sur une carte satellite, visualiser les images Sentinel-2 et suivre la météo locale.

Développé avec Next.js, hébergé sur Vercel, sans backend propre.

---

## Fonctionnalités

**Carte**
- Carte plein écran sur images aériennes IGN, avec noms de lieux et cadastre (à partir du zoom 15), panneau flottant à gauche sur ordinateur, feuille glissante en bas sur mobile
- Recherche de commune ou d'adresse (Géoplateforme IGN) et bouton « Me localiser »
- Parcelles affichées avec leur nom ; survol de la liste ↔ surbrillance sur la carte
- Thème clair ou sombre selon l'appareil

**Parcelles**
- Dessin directement sur la carte, avec suivi des sommets et de la surface en direct
- Avertissement si l'on dessine trop dézoomé ou si la surface est aberrante
- Renommage et suppression depuis la fiche parcelle ; parcelle ouverte gardée dans l'adresse (`/?p=…`)

**Images satellite**
- Frise des 12 dernières dates Sentinel-2 avec nébulosité ; ouverture sur la plus récente, frise défilante (glisser, flèches)
- Image reprojetée en WGS84 et posée sur la parcelle dans la carte (COG, range requests HTTP), opacité réglable
- Indices spectraux : couleurs naturelles, NDVI, NDWI, NDMI, avec valeur moyenne et histogramme sur la parcelle
- Détails de l'acquisition : satellite, heure, élévation solaire, nébulosité, occupation du sol
- Navigation entre dates avec les flèches ← →, Échap pour revenir à la liste

**Météo**
- Météo locale au centroïde de chaque parcelle (Open-Meteo, sans clé API)
- Conditions actuelles (température, ressenti, humidité, vent) + frise 5 jours (J-2 → J+2) avec pluie à l'échelle
- Météo du jour visible directement dans la liste de parcelles

---

## Stack

| Rôle | Technologie |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript |
| Styles | Tailwind CSS v4 |
| Carte | Leaflet + Leaflet.draw, Géoplateforme IGN (ortho-images, Parcellaire Express, noms) |
| Auth + BDD | Supabase (email/password, RLS) |
| Images satellite | Element 84 Earth Search (STAC API, Sentinel-2 L2A) |
| Lecture COG | geotiff.js (range requests HTTP) |
| Météo | Open-Meteo (gratuit, sans clé) |
| Recherche de lieu | Géoplateforme IGN (gratuit, sans clé) |
| Icônes | lucide-react |
| Déploiement | Vercel |

---

## Lancer en local

```bash
npm install
npm run dev
```

Créer un fichier `.env.local` à la racine :

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## Base de données Supabase

Seule la table `parcels` est utilisée, ainsi que la fonction `delete_user()` pour la suppression de compte.

Reconstruire la base sur un projet vide, dans cet ordre : `schema-parcels.sql`, `limites-parcels.sql`, puis les migrations du serveur MCP (section suivante) et `purge-audit-auth.sql`. `drop-hors-visualiseur.sql` ne sert qu'à l'ancienne base.

Réglages du dashboard dont dépend l'app :
- Authentication → URL Configuration → Redirect URLs : l'adresse du site et `/reinitialiser` (lien de l'email « mot de passe oublié »), en production et en local
- Authentication → Emails : SMTP personnalisé (Gmail), modèles « Confirm signup » et « Reset password » en français
- Authentication → Attack Protection : captcha Turnstile (clé secrète)

Sauvegardes : le plan gratuit n'en fournit aucune que l'on puisse restaurer. En cas de besoin : `pg_dump` avec la chaîne de connexion du projet (Settings → Database).

`supabase/limites-parcels.sql` impose les limites côté base (nom de 80 caractères, géométrie valide de 1 000 sommets au plus, 200 parcelles par compte) : le navigateur ne fait que les refléter.

`supabase/drop-hors-visualiseur.sql` supprime les tables des anciennes fonctionnalités (interventions, base produits e-phy, notes).

---

## Serveur MCP (applications connectées)

Un assistant IA autorisé par l'utilisateur lit ses parcelles en lecture seule via `/api/mcp`, avec un jeton OAuth 2.1 délivré par Supabase. Les clients OAuth sont créés à la main dans Supabase (liste blanche, pas d'enregistrement dynamique) et leur identifiant renseigné dans les variables `MCP_CLIENT_ID_*` (voir `.env.local.example`). La page `/connecter` explique la connexion ; `/applications` liste les accès et permet de les retirer.

Migrations, à exécuter dans cet ordre : `oauth-lecture-seule.sql`, `oauth-jeton-restreint.sql` (puis activer le hook dans Authentication → Hooks), `mcp-audit.sql` (puis la purge pg_cron indiquée à la fin du fichier), `oauth-revocation.sql`.

Tests :

```bash
npm test                                     # tests unitaires (Vitest), sans réseau
node scripts/oauth-e2e.mjs .env.local <client_id> https://i-parcel.vercel.app/api/mcp --revocation
```

Le second script joue le rôle d'une IA contre le vrai projet Supabase : à relancer après chaque mise à jour de Supabase, car le durcissement des jetons repose sur un comportement interne de Supabase Auth.
