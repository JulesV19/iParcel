# iParcel

Suivi de parcelles agricoles : dessin sur fond IGN (photos aériennes) ou choix parmi les parcelles déclarées à la PAC (RPG), images Sentinel-2, indices NDVI / NDWI / NDMI et météo locale.

https://i-parcel.vercel.app

## Serveur MCP

`/api/mcp` donne à une IA (Claude) un accès en lecture seule aux parcelles d'un utilisateur, via OAuth Supabase. Connexion : `/connecter`. Gestion des accès : `/applications`.

## Stack

**Application**
- Next.js 16 (App Router), React 19, TypeScript 5
- Tailwind CSS 4, icônes lucide-react
- Carte : Leaflet 1.9, leaflet-draw (dessin et ajustement des contours)
- Images satellite : geotiff (lecture partielle de COG), proj4 (reprojection UTM)
- Calcul des indices : navigateur pour l'app web, serveur pour le MCP

**Serveur MCP**
- `@modelcontextprotocol/sdk`, transport HTTP sans état, une instance par requête
- Validation des paramètres : zod
- Vérification des jetons : jose (JWT ES256, clés publiques Supabase)
- 6 outils en lecture seule : `list_parcels`, `get_parcel`, `get_weather`, `list_satellite_images`, `get_vegetation_index`, `get_vegetation_series`

**Hébergement**
- Vercel, plan Hobby, région `dub1` (Dublin), runtime Node.js
- Supabase, plan gratuit, région `eu-west-1` (Irlande) : Postgres, Auth, serveur OAuth 2.1
- Cloudflare Turnstile : protection anti-robot de la connexion

**Sécurité et quotas**
- RLS Postgres sur les parcelles ; jetons OAuth limités à la lecture
- Clients OAuth sur liste blanche, révocation immédiate
- Journal d'activité MCP (1 an) et cache des indices (90 jours)
- Quotas : 60 appels/min et 1 000/jour par compte ; calculs d'indice : 20/min et 60/jour par compte, 250/jour tous comptes

**Données**
- IGN Géoplateforme : orthophotos, noms de lieux, géocodage, RPG (WFS)
- Copernicus Sentinel-2 L2A via Element 84 Earth Search (STAC), COG sur AWS S3 `us-west-2`
- Open-Meteo : prévisions et archive historique (depuis 2018)

**Tests**
- Vitest

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
