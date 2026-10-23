const nf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const nf1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const nf4 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })

/** Surface géodésique d'un anneau [lon, lat], en hectares. */
export function ringAreaHa(coords: number[][]): number {
  const R = 6371008.8
  let area = 0
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length
    const lon1 = coords[i][0] * Math.PI / 180
    const lat1 = coords[i][1] * Math.PI / 180
    const lon2 = coords[j][0] * Math.PI / 180
    const lat2 = coords[j][1] * Math.PI / 180
    area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2))
  }
  return Math.abs(area) * R * R / 2 / 10_000
}

export function parcelAreaHa(geometry: GeoJSON.Polygon): number {
  return ringAreaHa(geometry.coordinates[0])
}

export function formatArea(ha: number): string {
  if (ha < 0.01) return `${Math.round(ha * 10_000)} m²`
  return `${nf2.format(ha)} ha`
}

export function formatTotalArea(ha: number): string {
  return `${nf1.format(ha)} ha`
}

export function formatCoords([lat, lon]: [number, number]): string {
  return `${nf4.format(Math.abs(lat))}° ${lat >= 0 ? 'N' : 'S'}  ${nf4.format(Math.abs(lon))}° ${lon >= 0 ? 'E' : 'O'}`
}

export function formatIndex(v: number): string {
  return nf2.format(v)
}

/** Tracé SVG d'une parcelle, centré dans un carré de `size` px (projection locale). */
export function shapePath(geometry: GeoJSON.Polygon, size: number, pad = 3): string {
  const ring = geometry.coordinates[0]
  const k = Math.cos(ring[0][1] * Math.PI / 180)
  const pts = ring.map(([lon, lat]) => [lon * k, -lat])
  const xs = pts.map(p => p[0])
  const ys = pts.map(p => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const inner = size - pad * 2
  const s = inner / (Math.max(maxX - minX, maxY - minY) || 1)
  const ox = pad + (inner - (maxX - minX) * s) / 2
  const oy = pad + (inner - (maxY - minY) * s) / 2
  return 'M' + pts.map(([x, y]) => `${(ox + (x - minX) * s).toFixed(1)},${(oy + (y - minY) * s).toFixed(1)}`).join('L') + 'Z'
}
