# iParcel

Suivi de parcelles agricoles : dessin sur fond IGN (photos aériennes) ou choix parmi les parcelles déclarées à la PAC (RPG), images Sentinel-2, indices NDVI / NDWI / NDMI et météo locale.

https://i-parcel.vercel.app

## Serveur MCP

`/api/mcp` donne à une IA (Claude) un accès en lecture seule aux parcelles d'un utilisateur, via OAuth Supabase. Connexion : `/connecter`. Gestion des accès : `/applications`.

## Stack

Next.js, Tailwind, Leaflet, Supabase, Vercel. Données : IGN, Copernicus Sentinel-2 (Element 84), Open-Meteo.

## Installation

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Base de données : exécuter les scripts de `supabase/` dans cet ordre : `schema-parcels`, `limites-parcels`, `oauth-lecture-seule`, `oauth-jeton-restreint`, `mcp-audit`, `oauth-revocation`, `mcp-budget`, `purge-audit-auth`. Les réglages à faire ensuite dans le dashboard sont indiqués en tête de chaque fichier.

## Tests

```bash
npm test
node scripts/oauth-e2e.mjs .env.local <client_id> https://i-parcel.vercel.app/api/mcp --revocation
```

Le second test s'exécute contre le projet Supabase réel, à relancer après chaque mise à jour de Supabase.
