// Registre parcellaire graphique (RPG) : parcelles déclarées à la PAC, diffusées par l'IGN
// (WFS de la Géoplateforme, sans clé, Licence Ouverte Etalab 2.0)
const WFS_URL = 'https://data.geopf.fr/wfs/ows'

// RPG.LATEST suit la dernière édition publiée : à mettre à jour quand l'IGN en publie une nouvelle
export const RPG_EDITION = 2025
// En dessous, une vue couvre des milliers de parcelles (plusieurs Mo)
export const RPG_MIN_ZOOM = 15
const MAX_FEATURES = 4000

export interface RpgBounds { south: number; west: number; north: number; east: number }

export type RpgFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, { code_cultu: string | null }>

export interface RpgPick {
  geometry: GeoJSON.Polygon
  /** Code culture PAC (ex. BTH), voir cultureLabels */
  culture: string | null
}

function wfsUrl(params: Record<string, string>): string {
  return `${WFS_URL}?${new URLSearchParams({ SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', OUTPUTFORMAT: 'application/json', ...params })}`
}

/** Parcelles RPG qui touchent l'emprise. truncated : la zone en contient plus que MAX_FEATURES. */
export async function fetchRpgParcels(b: RpgBounds, signal: AbortSignal): Promise<{ features: RpgFeature[]; truncated: boolean }> {
  const url = wfsUrl({
    TYPENAMES: 'RPG.LATEST:parcelles_graphiques',
    SRSNAME: 'EPSG:4326',
    PROPERTYNAME: 'geom,code_cultu',
    // EPSG:4326 en WFS 2.0 : emprise en latitude, longitude ; le GeoJSON renvoyé est en [longitude, latitude]
    BBOX: `${b.south},${b.west},${b.north},${b.east},urn:ogc:def:crs:EPSG::4326`,
    COUNT: String(MAX_FEATURES),
  })
  const res = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) })
  if (!res.ok) throw new Error(`RPG : HTTP ${res.status}`)
  const data = await res.json() as { features?: unknown[]; numberMatched?: number }
  const features = (data.features ?? []).filter((f): f is RpgFeature => {
    const g = (f as { geometry?: { type?: string; coordinates?: unknown } } | null)?.geometry
    return !!g && (g.type === 'Polygon' || g.type === 'MultiPolygon') && Array.isArray(g.coordinates)
  })
  return { features, truncated: typeof data.numberMatched === 'number' && data.numberMatched > features.length }
}

let labels: Promise<Record<string, string>> | null = null

/** Libellés des codes culture PAC (ex. BTH → Blé tendre d'hiver), chargés une seule fois. */
export function cultureLabels(): Promise<Record<string, string>> {
  labels ??= fetch(wfsUrl({ TYPENAMES: 'RPG.LATEST:codes_cultures', PROPERTYNAME: 'code_culture,libelle_culture', COUNT: '1000' }), { signal: AbortSignal.timeout(15_000) })
    .then(res => {
      if (!res.ok) throw new Error(`RPG codes : HTTP ${res.status}`)
      return res.json() as Promise<{ features: { properties: { code_culture: string; libelle_culture: string } }[] }>
    })
    .then(data => Object.fromEntries(data.features.map(f => [f.properties.code_culture, f.properties.libelle_culture])))
    .catch(e => {
      console.error(e)
      labels = null
      return {}
    })
  return labels
}

function ringContains(ring: GeoJSON.Position[], [x, y]: GeoJSON.Position): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function ringSpan(ring: GeoJSON.Position[]): number {
  let area = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
  return Math.abs(area)
}

/**
 * Contour extérieur de la partie cliquée (ou de la plus grande) : une parcelle iParcel n'a qu'un
 * anneau (supabase/limites-parcels.sql), les trous et les autres morceaux sont abandonnés.
 */
export function pickPolygon(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon, point: GeoJSON.Position): GeoJSON.Polygon {
  const outers = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).map(p => p[0])
  const ring = outers.find(r => ringContains(r, point))
    ?? outers.reduce((a, b) => ringSpan(b) > ringSpan(a) ? b : a)
  const first = ring[0]
  const last = ring[ring.length - 1]
  const closed = first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first]
  return { type: 'Polygon', coordinates: [closed.map(([lon, lat]) => [lon, lat])] }
}
