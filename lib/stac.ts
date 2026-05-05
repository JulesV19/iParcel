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
  bbox: [number, number, number, number]
}

type StacFeature = {
  bbox: [number, number, number, number]
  properties: { datetime: string }
  assets: {
    thumbnail?: { href: string }
    overview?: { href: string }
    visual?: { href: string }
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
      bbox: f.bbox,
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
