const STAC_URL = 'https://earth-search.aws.element84.com/v1/search'

function getBbox(geometry: GeoJSON.Polygon): [number, number, number, number] {
  const coords = geometry.coordinates[0]
  if (!coords || coords.length === 0) throw new Error('Géométrie de parcelle invalide')
  const lons = coords.map(c => c[0])
  const lats = coords.map(c => c[1])
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
}

export interface SentinelItem {
  date: string
  thumbnail: string
  visualUrl: string
  redUrl: string    // B04 — 10m
  nirUrl: string    // B08 — 10m
  greenUrl: string  // B03 — 10m
  swirUrl: string   // B11 — 20m
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
  bbox: [number, number, number, number]
  properties: {
    datetime: string
    platform?: string
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
  }
}

function isValidFeature(f: unknown): f is StacFeature {
  if (!f || typeof f !== 'object') return false
  const feat = f as StacFeature
  return (
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

export async function fetchSentinelDates(geometry: GeoJSON.Polygon): Promise<SentinelItem[]> {
  const res = await fetch(STAC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collections: ['sentinel-2-l2a'],
      bbox: getBbox(geometry),
      limit: 10,
    }),
  })
  if (!res.ok) throw new Error(`STAC API error ${res.status}`)
  const json = await res.json()
  const items: SentinelItem[] = (json.features ?? [])
    .filter(isValidFeature)
    .map((f: StacFeature) => ({
      date: f.properties.datetime,
      thumbnail: f.assets.thumbnail?.href ?? f.assets.overview?.href ?? '',
      visualUrl: f.assets.visual?.href ?? '',
      redUrl: f.assets.red?.href ?? '',
      nirUrl: f.assets.nir?.href ?? '',
      greenUrl: f.assets.green?.href ?? '',
      swirUrl: f.assets.swir16?.href ?? '',
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
  // Dédupliquer par date : plusieurs granules Sentinel peuvent couvrir le même bbox à la même date
  const seen = new Set<string>()
  return items.filter(item => {
    if (seen.has(item.date)) return false
    seen.add(item.date)
    return true
  }).slice(0, 5)
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
