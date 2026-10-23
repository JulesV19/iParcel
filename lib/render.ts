import proj4 from 'proj4'
import type { SentinelItem } from '@/lib/stac'

export type IndexType = 'RGB' | 'NDVI' | 'NDWI' | 'NDMI'

type ColorStop = { v: number; r: number; g: number; b: number }

const NDVI_STOPS: ColorStop[] = [
  { v: -1,  r: 120, g: 69,  b: 19  },
  { v: 0,   r: 190, g: 170, b: 130 },
  { v: 0.2, r: 215, g: 225, b: 80  },
  { v: 0.5, r: 80,  g: 170, b: 50  },
  { v: 1.0, r: 0,   g: 80,  b: 0   },
]

const NDWI_STOPS: ColorStop[] = [
  { v: -1,   r: 180, g: 130, b: 70  },
  { v: -0.1, r: 230, g: 210, b: 160 },
  { v: 0.1,  r: 150, g: 200, b: 220 },
  { v: 1.0,  r: 0,   g: 80,  b: 180 },
]

const NDMI_STOPS: ColorStop[] = [
  { v: -1,   r: 180, g: 50,  b: 20  },
  { v: -0.2, r: 230, g: 180, b: 80  },
  { v: 0.1,  r: 200, g: 230, b: 160 },
  { v: 0.4,  r: 40,  g: 150, b: 130 },
  { v: 1.0,  r: 0,   g: 80,  b: 120 },
]

export interface IndexInfo {
  label: string
  name: string
  description: string
  stops: ColorStop[] | null
  ticks: Array<{ v: number; label: string }>
}

export const INDEX_INFO: Record<IndexType, IndexInfo> = {
  RGB: {
    label: 'Couleurs',
    name: 'Couleurs naturelles',
    description: "L'image telle que le satellite l'a captée, en vraies couleurs. Utile pour repérer nuages, ombres et travaux récents.",
    stops: null,
    ticks: [],
  },
  NDVI: {
    label: 'NDVI',
    name: 'Vigueur de la végétation',
    description: 'Compare le proche infrarouge et le rouge. Plus la valeur est haute, plus le couvert végétal est dense et actif.',
    stops: NDVI_STOPS,
    ticks: [{ v: -1, label: '−1' }, { v: 0, label: '0' }, { v: 0.5, label: '0,5' }, { v: 1, label: '1' }],
  },
  NDWI: {
    label: 'NDWI',
    name: 'Eau libre',
    description: "Compare le vert et le proche infrarouge. Les valeurs positives signalent de l'eau : mares, fossés, zones inondées.",
    stops: NDWI_STOPS,
    ticks: [{ v: -1, label: '−1' }, { v: 0, label: '0' }, { v: 1, label: '1' }],
  },
  NDMI: {
    label: 'NDMI',
    name: 'Humidité des plantes',
    description: "Compare le proche infrarouge et l'infrarouge moyen. Les valeurs basses signalent un manque d'eau dans la végétation.",
    stops: NDMI_STOPS,
    ticks: [{ v: -1, label: '−1' }, { v: 0, label: '0' }, { v: 1, label: '1' }],
  },
}

export function gradientCss(stops: ColorStop[]): string {
  return `linear-gradient(to right, ${stops.map(s => `rgb(${s.r},${s.g},${s.b}) ${((s.v + 1) / 2 * 100).toFixed(1)}%`).join(', ')})`
}

export function colorAt(val: number, stops: ColorStop[]): [number, number, number] {
  if (val <= stops[0].v) return [stops[0].r, stops[0].g, stops[0].b]
  const last = stops[stops.length - 1]
  if (val >= last.v) return [last.r, last.g, last.b]
  for (let i = 0; i < stops.length - 1; i++) {
    if (val <= stops[i + 1].v) {
      const t = (val - stops[i].v) / (stops[i + 1].v - stops[i].v)
      return [
        Math.round(stops[i].r + t * (stops[i + 1].r - stops[i].r)),
        Math.round(stops[i].g + t * (stops[i + 1].g - stops[i].g)),
        Math.round(stops[i].b + t * (stops[i + 1].b - stops[i].b)),
      ]
    }
  }
  return [0, 0, 0]
}

function utmProj4(epsgCode: number): string | null {
  if (epsgCode >= 32601 && epsgCode <= 32660)
    return `+proj=utm +zone=${epsgCode - 32600} +datum=WGS84 +units=m +no_defs`
  if (epsgCode >= 32701 && epsgCode <= 32760)
    return `+proj=utm +zone=${epsgCode - 32700} +south +datum=WGS84 +units=m +no_defs`
  return null
}

function stretch(value: number, isUint16: boolean): number {
  if (!isUint16) return Math.min(255, Math.max(0, value))
  return Math.min(255, Math.round((value / 3000) * 255))
}

interface PixelWindow {
  x0: number; y0: number; x1: number; y1: number
  w: number; h: number
  scaleX: number; scaleY: number
}

function calcWindow(
  imageWidth: number,
  imageHeight: number,
  nativeBbox: number[],
  parcelCRS: [number, number][]
): PixelWindow | null {
  const bboxW = nativeBbox[2] - nativeBbox[0]
  const bboxH = nativeBbox[3] - nativeBbox[1]
  if (bboxW === 0 || bboxH === 0 || imageWidth === 0 || imageHeight === 0) return null

  const scaleX = imageWidth / bboxW
  const scaleY = imageHeight / bboxH

  const xs = parcelCRS.map(c => c[0])
  const ys = parcelCRS.map(c => c[1])
  const rawX0 = Math.floor((Math.min(...xs) - nativeBbox[0]) * scaleX)
  const rawX1 = Math.ceil((Math.max(...xs) - nativeBbox[0]) * scaleX)
  const rawY0 = Math.floor((nativeBbox[3] - Math.max(...ys)) * scaleY)
  const rawY1 = Math.ceil((nativeBbox[3] - Math.min(...ys)) * scaleY)

  const cx = (rawX0 + rawX1) / 2
  const cy = (rawY0 + rawY1) / 2
  const halfSide = Math.ceil(Math.max(rawX1 - rawX0, rawY1 - rawY0, 10) / 2 * 1.1)

  const x0 = Math.max(0, Math.round(cx - halfSide))
  const x1 = Math.min(imageWidth, Math.round(cx + halfSide))
  const y0 = Math.max(0, Math.round(cy - halfSide))
  const y1 = Math.min(imageHeight, Math.round(cy + halfSide))

  if (x1 <= x0 || y1 <= y0) return null
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, scaleX, scaleY }
}

export const HIST_BINS = 40

export interface ParcelStats {
  mean: number
  histogram: number[]
}

export interface RenderResult {
  url: string
  /** [[sud, ouest], [nord, est]] */
  bounds: [[number, number], [number, number]]
  stats: ParcelStats | null
}

const OUT_RES_M = 2.5
const OUT_MAX_PX = 640
// Au-delà, le serveur d'images est considéré comme injoignable
const RENDER_TIMEOUT_MS = 60_000

/**
 * Lit les COG Sentinel-2 autour de la parcelle et produit une image reprojetée en WGS84,
 * découpée au contour de la parcelle, prête à poser sur la carte.
 */
export async function renderParcel(
  item: SentinelItem,
  geometry: GeoJSON.Polygon,
  index: IndexType,
  report: (pct: number, label: string) => void,
  isCancelled: () => boolean,
): Promise<RenderResult | null> {
  const secUrl = index === 'NDVI' ? item.redUrl : index === 'NDWI' ? item.greenUrl : item.swirUrl
  if (index === 'RGB' && !item.visualUrl) throw new Error("Pas d'image en couleurs pour cette date.")
  if (index !== 'RGB' && (!item.nirUrl || !secUrl)) throw new Error(`Bandes manquantes pour calculer le ${index} à cette date.`)

  const { fromUrl } = await import('geotiff')
  const signal = AbortSignal.timeout(RENDER_TIMEOUT_MS)
  const ring = geometry.coordinates[0]

  report(10, index === 'RGB' ? "Ouverture de l'image…" : 'Ouverture de la bande proche infrarouge…')
  const tiff = await fromUrl(index === 'RGB' ? item.visualUrl : item.nirUrl, undefined, signal)
  const image = await tiff.getImage()
  const nativeBbox = image.getBoundingBox()
  const epsgCode = image.getGeoKeys()?.ProjectedCSTypeGeoKey as number | undefined
  const proj4Str = epsgCode ? utmProj4(epsgCode) : null
  const toCRS = (lon: number, lat: number): [number, number] =>
    proj4Str ? proj4('WGS84', proj4Str, [lon, lat]) as [number, number] : [lon, lat]

  const win = calcWindow(image.getWidth(), image.getHeight(), nativeBbox, ring.map(c => toCRS(c[0], c[1])))
  if (!win) throw new Error('La parcelle est en dehors de cette image.')

  let bands: ArrayLike<number>[]
  if (index === 'RGB') {
    report(35, 'Téléchargement des pixels…')
    const rasters = await image.readRasters({ window: [win.x0, win.y0, win.x1, win.y1], samples: [0, 1, 2], signal })
    bands = [rasters[0], rasters[1], rasters[2]] as ArrayLike<number>[]
    if (bands.some(b => !b)) throw new Error("L'image en couleurs est incomplète.")
  } else {
    const secLabel = index === 'NDVI' ? 'rouge' : index === 'NDWI' ? 'verte' : 'infrarouge moyen'
    report(30, 'Téléchargement de la bande proche infrarouge…')
    const nir = (await image.readRasters({ window: [win.x0, win.y0, win.x1, win.y1], width: win.w, height: win.h, samples: [0], signal }))[0]

    report(55, `Ouverture de la bande ${secLabel}…`)
    const secImage = await (await fromUrl(secUrl, undefined, signal)).getImage()
    const secWin = calcWindow(secImage.getWidth(), secImage.getHeight(), secImage.getBoundingBox(), ring.map(c => toCRS(c[0], c[1])))
    if (!secWin) throw new Error('La parcelle est en dehors de cette image.')

    report(70, `Téléchargement de la bande ${secLabel}…`)
    const sec = (await secImage.readRasters({
      window: [secWin.x0, secWin.y0, secWin.x1, secWin.y1],
      width: win.w,
      height: win.h,
      samples: [0],
      signal,
    }))[0]
    if (!nir || !sec) throw new Error('Bandes spectrales incomplètes pour cette date.')
    bands = [nir, sec] as ArrayLike<number>[]
  }

  if (isCancelled()) return null
  report(90, index === 'RGB' ? 'Assemblage…' : `Calcul du ${index}…`)

  // Grille de sortie en degrés, à ~2,5 m, limitée à la parcelle
  const lons = ring.map(c => c[0])
  const lats = ring.map(c => c[1])
  const west = Math.min(...lons), east = Math.max(...lons)
  const south = Math.min(...lats), north = Math.max(...lats)
  const metersW = (east - west) * 111_320 * Math.cos((south + north) / 2 * Math.PI / 180)
  const metersH = (north - south) * 110_574
  const res = Math.max(OUT_RES_M, Math.max(metersW, metersH) / OUT_MAX_PX)
  const W = Math.max(1, Math.ceil(metersW / res))
  const H = Math.max(1, Math.ceil(metersH / res))

  // À l'échelle d'une parcelle, la projection UTM est quasi affine : on interpole entre les 4 coins
  const nw = toCRS(west, north), ne = toCRS(east, north)
  const sw = toCRS(west, south), se = toCRS(east, south)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error("Le navigateur ne permet pas d'afficher l'image.")
  const img = ctx.createImageData(W, H)
  const px = img.data

  const stops = INDEX_INFO[index].stops
  const isUint16 = bands[0] instanceof Uint16Array
  const histogram = new Array<number>(HIST_BINS).fill(0)
  let sum = 0
  let count = 0

  for (let j = 0; j < H; j++) {
    const v = (j + 0.5) / H
    const lat = north - v * (north - south)

    // Remplissage par balayage : intersections du contour avec la ligne
    const xs: number[] = []
    for (let k = 0; k < ring.length - 1; k++) {
      const [ax, ay] = ring[k]
      const [bx, by] = ring[k + 1]
      if ((ay > lat) !== (by > lat)) xs.push(ax + (lat - ay) / (by - ay) * (bx - ax))
    }
    xs.sort((a, b) => a - b)

    for (let s = 0; s + 1 < xs.length; s += 2) {
      const iStart = Math.max(0, Math.ceil((xs[s] - west) / (east - west) * W - 0.5))
      const iEnd = Math.min(W - 1, Math.ceil((xs[s + 1] - west) / (east - west) * W - 0.5) - 1)
      for (let i = iStart; i <= iEnd; i++) {
        const u = (i + 0.5) / W
        const X = (1 - u) * (1 - v) * nw[0] + u * (1 - v) * ne[0] + (1 - u) * v * sw[0] + u * v * se[0]
        const Y = (1 - u) * (1 - v) * nw[1] + u * (1 - v) * ne[1] + (1 - u) * v * sw[1] + u * v * se[1]
        const col = Math.floor((X - nativeBbox[0]) * win.scaleX) - win.x0
        const row = Math.floor((nativeBbox[3] - Y) * win.scaleY) - win.y0
        if (col < 0 || row < 0 || col >= win.w || row >= win.h) continue
        const k = row * win.w + col
        const o = (j * W + i) * 4

        if (!stops) {
          const r = bands[0][k], g = bands[1][k], b = bands[2][k]
          if (r === 0 && g === 0 && b === 0) continue
          px[o] = stretch(r, isUint16)
          px[o + 1] = stretch(g, isUint16)
          px[o + 2] = stretch(b, isUint16)
          px[o + 3] = 255
          count++
        } else {
          const nir = bands[0][k], sec = bands[1][k]
          if (nir === 0 && sec === 0) continue
          const val = index === 'NDWI' ? (sec - nir) / (sec + nir) : (nir - sec) / (nir + sec)
          const [r, g, b] = colorAt(val, stops)
          px[o] = r
          px[o + 1] = g
          px[o + 2] = b
          px[o + 3] = 255
          sum += val
          count++
          histogram[Math.min(HIST_BINS - 1, Math.max(0, Math.floor((val + 1) / 2 * HIST_BINS)))]++
        }
      }
    }
  }

  if (count === 0) throw new Error("Pas de données sur la parcelle à cette date.")
  ctx.putImageData(img, 0, 0)

  return {
    url: canvas.toDataURL('image/png'),
    bounds: [[south, west], [north, east]],
    stats: stops ? { mean: sum / count, histogram } : null,
  }
}
