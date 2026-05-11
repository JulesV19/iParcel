# iParcel

Application web pour agriculteurs de grandes cultures. Permet de dessiner des parcelles sur une carte satellite, visualiser les images Sentinel-2, suivre la météo locale, et tenir un registre des interventions agricoles.

Développé avec Next.js, hébergé sur Vercel, sans backend propre.

---

## Fonctionnalités

**Parcelles**
- Dessin de polygones sur fond satellite ESRI (Leaflet)
- Surface calculée en ha ou m²
- Renommage et suppression depuis le tableau de bord

**Images satellite**
- Dates Sentinel-2 disponibles affichées en widget horizontal par parcelle
- Ouverture automatique sur la date la plus récente au clic
- Affichage de l'image recadrée sur la parcelle (COG, range requests HTTP)
- Indices spectraux : RGB, NDVI, NDWI, NDMI avec légende agronomique
- Métadonnées de prise de vue : satellite, élévation solaire, couverture nuageuse, occupation du sol

**Météo**
- Météo locale au centroïde de chaque parcelle (Open-Meteo, sans clé API)
- Conditions actuelles + frise 5 jours (J-2 → J+2)
- Mini météo du jour visible directement dans la liste de parcelles

**Interventions agricoles**
- 8 catégories : travail du sol, semis, fertilisation, traitement phytosanitaire, irrigation, récolte, observation, autre
- Champs communs : date, culture (22 cultures), stade BBCH, opérateur, matériel, surface, commentaire
- Conditions météo : remplissage automatique depuis Open-Meteo selon la date de l'intervention
- Vue détail par clic + modification et suppression
- Champs spécifiques par catégorie (variété, rendement, volume de bouillie, etc.)

**Traitement phytosanitaire**
- Recherche autocomplete dans la base e-phy ANSES (~15 000 produits)
- Vérification automatique de conformité : culture autorisée, cible autorisée, dose maximale
- Menu déroulant dynamique des cibles selon produit × culture

**Fertilisation**
- Recherche autocomplete dans la base MFSC/PRODUIT-MIXTE e-phy ANSES
- Composition détaillée par produit avec fenêtres min/max et alerte hors-fenêtre
- Vérification de la dose autorisée par culture

**Notes de terrain**
- Notes libres par parcelle avec date locale automatique
- Ajout, modification, suppression

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

Exécuter `supabase/schema-interventions.sql` dans l'éditeur SQL de Supabase pour créer les tables `interventions`, `produits_phyto`, `usages_phyto`, `produits_mfsc`, `usages_mfsc`.

Les tables `parcels` et `notes` sont à créer manuellement (schémas dans la doc Obsidian).

---

## Importer les données e-phy (ANSES)

Ajouter `SUPABASE_SERVICE_ROLE_KEY` dans `.env.local`, puis lancer les scripts dans l'ordre :

```bash
# Produits phytosanitaires (~15 000 lignes)
node scripts/import-ephy.mjs produits_utf8.csv

# Usages phyto (~80 000 lignes)
node scripts/import-usages.mjs produits_usages_utf8.csv

# Produits fertilisants MFSC
node scripts/import-mfsc.mjs mfsc_et_mixte_composition_utf8.csv

# Doses autorisées MFSC par culture
node scripts/import-usages-mfsc.mjs mfsc_et_mixte_usage_utf8.csv
```

Les CSV sont disponibles sur [ephy.anses.fr](https://ephy.anses.fr) → Téléchargement des données.
