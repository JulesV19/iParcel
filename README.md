# iParcel

Visualiseur de parcelles agricoles. Permet de dessiner des parcelles sur une carte satellite, visualiser les images Sentinel-2 et suivre la météo locale.

Développé avec Next.js, hébergé sur Vercel, sans backend propre.

---

## Fonctionnalités

**Carte**
- Carte satellite plein écran (ESRI World Imagery + noms de lieux), panneau flottant à gauche sur ordinateur, feuille glissante en bas sur mobile
- Recherche de commune ou d'adresse (Géoplateforme IGN) et bouton « Me localiser »
- Parcelles affichées avec leur nom ; survol de la liste ↔ surbrillance sur la carte
- Thème clair ou sombre selon l'appareil

**Parcelles**
- Dessin directement sur la carte, avec suivi des sommets et de la surface en direct
- Avertissement si l'on dessine trop dézoomé ou si la surface est aberrante
- Renommage et suppression depuis la fiche parcelle ; parcelle ouverte gardée dans l'adresse (`/?p=…`)

**Images satellite**
- Frise des 12 dernières dates Sentinel-2 avec nébulosité ; ouverture sur la plus récente peu nuageuse
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
| Carte | Leaflet + Leaflet.draw, fond ESRI World Imagery |
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

Seule la table `parcels` est utilisée (schéma dans la doc Obsidian), ainsi que la fonction `delete_user()` pour la suppression de compte.

`supabase/limites-parcels.sql` impose les limites côté base (nom de 80 caractères, géométrie valide de 1 000 sommets au plus, 200 parcelles par compte) : le navigateur ne fait que les refléter.

`supabase/drop-hors-visualiseur.sql` supprime les tables des anciennes fonctionnalités (interventions, base produits e-phy, notes).
