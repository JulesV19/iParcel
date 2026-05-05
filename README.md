# iParcel

Application web pour agriculteurs : dessiner des parcelles sur une carte satellite et consulter les images Sentinel-2 disponibles.

## Fonctionnalités

- Authentification email/mot de passe (Supabase)
- Dessin de parcelles sur fond satellite (Leaflet)
- Consultation des 5 dernières images Sentinel-2 disponibles par parcelle
- Affichage de l'image satellite recadrée sur la parcelle au clic (COG via geotiff.js)

## Stack

- Next.js 16, TypeScript, Tailwind
- Supabase (auth + base de données)
- Element 84 Earth Search (STAC API Sentinel-2)
- geotiff.js (lecture Cloud Optimized GeoTIFF)
- Déployé sur Vercel

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
