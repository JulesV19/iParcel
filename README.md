# iParcel

Application web pour agriculteurs : dessiner des parcelles sur une carte satellite et consulter les images Sentinel-2 disponibles.

## Fonctionnalités

- Authentification email/mot de passe (Supabase)
- Dessin de parcelles sur fond satellite (Leaflet)
- Consultation des 5 dernières images Sentinel-2 disponibles par parcelle, avec couverture nuageuse affichée sur chaque badge de date
- Interface en deux panneaux : liste des parcelles à gauche, visualisation à droite
- Affichage de l'image satellite recadrée sur la parcelle (fenêtre carrée, 10% de marge) au clic sur une date
- Sélecteur d'indice : **RGB**, **NDVI** (végétation), **NDWI** (eau libre), **NDMI** (humidité/stress hydrique)
- Légende colorée avec description agronomique et échelle de valeurs pour chaque indice
- Barre de progression avec étapes nommées pendant le chargement des bandes
- Métadonnées de la prise de vue : satellite, élévation soleil, couverture nuageuse détaillée, occupation du sol, pixels sans donnée
- Météo locale au centroïde de la parcelle : conditions actuelles (icône, description, min/max, ressenti, humidité, précipitations) + frise sur 5 jours (J-2 à J+2) centrée sur aujourd'hui

## Stack

- Next.js 16, TypeScript, Tailwind
- Supabase (auth + base de données)
- Element 84 Earth Search (STAC API Sentinel-2 L2A)
- geotiff.js (lecture Cloud Optimized GeoTIFF via range requests)
- Open-Meteo (météo gratuite, sans clé API)
- lucide-react (icônes SVG)
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
