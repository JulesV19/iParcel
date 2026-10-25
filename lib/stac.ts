const STAC_URL = 'https://earth-search.aws.element84.com/v1/search'

function getBbox(geometry: GeoJSON.Polygon): [number, number, number, number] {
  const coords = geometry.coordinates[0]
  if (!coords || coords.length === 0) throw new Error('Géométrie de parcelle invalide')
  const lons = coords.map(c => c[0])
  const lats = coords.map(c => c[1])
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
}

export interface SentinelItem {
  /** Identifiant STAC de la scène, ex. S2B_31UCP_20261024_0_L2A */
  id: string
  date: string
  thumbnail: string
  visualUrl: string
  redUrl: string    // B04 — 10m
  nirUrl: string    // B08 — 10m
  greenUrl: string  // B03 — 10m
  swirUrl: string   // B11 — 20m
  sclUrl: string    // SCL (classification nuages, ombres, neige) — 20m
  bbox: [number, number, number, number]
  cloudCover: number | null
  cloudShadow: number | null
  vegetation: number | null
  water: number | null
  snow: number | null
  nodata: number | null
  sunElevation: number | null
  platform: string | null
}

type StacFeature = {
  id: string
  bbox: [number, number, number, number]
  properties: {
    datetime: string
    platform?: string
    's2:processing_baseline'?: string
    'earthsearch:boa_offset_applied'?: boolean
    'eo:cloud_cover'?: number
    'view:sun_elevation'?: number
    's2:cloud_shadow_percentage'?: number
    's2:vegetation_percentage'?: number
    's2:water_percentage'?: number
    's2:snow_ice_percentage'?: number
    's2:nodata_pixel_percentage'?: number
  }
  assets: {
    thumbnail?: { href: string }
    overview?: { href: string }
    visual?: { href: string }
    red?: { href: string }
    nir?: { href: string }
    green?: { href: string }
    swir16?: { href: string }
    scl?: { href: string }
  }
}

function isValidFeature(f: unknown): f is StacFeature {
  if (!f || typeof f !== 'object') return false
  const feat = f as StacFeature
  return (
    typeof feat.id === 'string' &&
    Array.isArray(feat.bbox) &&
    feat.bbox.length === 4 &&
    feat.bbox.every(n => typeof n === 'number' && isFinite(n)) &&
    typeof feat.properties?.datetime === 'string'
  )
}

function toPercent(raw: unknown): number | null {
  const n = Number(raw)
  return isFinite(n) && n >= 0 && n <= 100 ? n : null
}

function toFinite(raw: unknown): number | null {
  const n = Number(raw)
  return isFinite(n) ? n : null
}

// Depuis la version de traitement 04.00 (2022), l'ESA ajoute 1000 aux valeurs des bandes.
// Earth Search retire ce décalage des fichiers quand earthsearch:boa_offset_applied est vrai ;
// sinon les valeurs peuvent le contenir encore (mesuré : janvier à octobre 2022, janvier à
// mars 2025) et les indices seraient faussés. Ces scènes sont écartées.
function isHarmonized(f: StacFeature): boolean {
  const baseline = f.properties['s2:processing_baseline']
  return typeof baseline === 'string' && (baseline < '04.00' || f.properties['earthsearch:boa_offset_applied'] === true)
}

// Champs lus par l'app : la réponse complète pèse environ 25 Ko par scène
const FIELDS = {
  include: [
    'id', 'bbox', 'properties.datetime', 'properties.platform', 'properties.eo:cloud_cover', 'properties.view:sun_elevation',
    'properties.s2:cloud_shadow_percentage', 'properties.s2:vegetation_percentage', 'properties.s2:water_percentage',
    'properties.s2:snow_ice_percentage', 'properties.s2:nodata_pixel_percentage',
    'properties.s2:processing_baseline', 'properties.earthsearch:boa_offset_applied',
    ...['thumbnail', 'overview', 'visual', 'red', 'nir', 'green', 'swir16', 'scl'].map(a => `assets.${a}.href`),
  ],
  exclude: ['geometry', 'links'],
}

export interface SentinelSearch {
  /** Période AAAA-MM-JJ, bornes incluses (UTC) ; sans période : les scènes les plus récentes */
  start?: string
  end?: string
  /** Couverture nuageuse maximale de la tuile, en % */
  maxCloud?: number
  /** Nombre de jours renvoyés au plus */
  max?: number
}

/** Scènes Sentinel-2 couvrant la parcelle, une par jour, de la plus récente à la plus ancienne. */
export async function fetchSentinelDates(geometry: GeoJSON.Polygon, search: SentinelSearch = {}): Promise<SentinelItem[]> {
  const { start, end, maxCloud, max = 12 } = search
  const res = await fetch(STAC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collections: ['sentinel-2-l2a'],
      bbox: getBbox(geometry),
      // Une année compte environ 300 scènes sur une parcelle (plusieurs par jour possibles)
      limit: start ? 1000 : 30,
      ...(start && { datetime: `${start}T00:00:00Z/${end ?? start}T23:59:59Z` }),
      ...(maxCloud !== undefined && { query: { 'eo:cloud_cover': { lte: maxCloud } } }),
      sortby: [{ field: 'properties.datetime', direction: 'desc' }],
      fields: FIELDS,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`STAC API error ${res.status}`)
  const json = await res.json()
  const items: SentinelItem[] = (json.features ?? [])
    .filter(isValidFeature)
    .filter(isHarmonized)
    .map((f: StacFeature) => ({
      id: f.id,
      date: f.properties.datetime,
      thumbnail: f.assets.thumbnail?.href ?? f.assets.overview?.href ?? '',
      visualUrl: f.assets.visual?.href ?? '',
      redUrl: f.assets.red?.href ?? '',
      nirUrl: f.assets.nir?.href ?? '',
      greenUrl: f.assets.green?.href ?? '',
      swirUrl: f.assets.swir16?.href ?? '',
      sclUrl: f.assets.scl?.href ?? '',
      bbox: f.bbox,
      cloudCover: toPercent(f.properties['eo:cloud_cover']),
      cloudShadow: toPercent(f.properties['s2:cloud_shadow_percentage']),
      vegetation: toPercent(f.properties['s2:vegetation_percentage']),
      water: toPercent(f.properties['s2:water_percentage']),
      snow: toPercent(f.properties['s2:snow_ice_percentage']),
      nodata: toPercent(f.properties['s2:nodata_pixel_percentage']),
      sunElevation: toFinite(f.properties['view:sun_elevation']),
      platform: typeof f.properties.platform === 'string' ? f.properties.platform : null,
    }))
    .filter((item: SentinelItem) => item.thumbnail)
    .sort((a: SentinelItem, b: SentinelItem) => b.date.localeCompare(a.date))
  // Dédupliquer par jour : plusieurs granules Sentinel peuvent couvrir le même bbox le même jour
  const seen = new Set<string>()
  return items.filter(item => {
    const day = item.date.slice(0, 10)
    if (seen.has(day)) return false
    seen.add(day)
    return true
  }).slice(0, max)
}

/** Image proposée par défaut : la plus récente, nuageuse ou non (le % de nuages est affiché sur la frise). */
export function pickDefaultItem(items: SentinelItem[]): SentinelItem | null {
  return items[0] ?? null
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
