'use client'

import { useEffect, useRef, useState } from 'react'
import proj4 from 'proj4'
import type { SentinelItem } from '@/lib/stac'

export type IndexType = 'RGB' | 'NDVI' | 'NDWI' | 'NDMI'

interface Props {
  item: SentinelItem
  parcelGeometry: GeoJSON.Polygon
  index: IndexType
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

type ColorStop = { v: number; r: number; g: number; b: number }

function interpolateColor(val: number, stops: ColorStop[]): [number, number, number] {
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

const INDEX_META: Record<IndexType, {
  description: string
  stops: ColorStop[] | null
  ticks: Array<{ v: number; label: string }> | null
}> = {
  RGB: {
    description: 'Composition en vraies couleurs (Rouge – Vert – Bleu).',
    stops: null,
    ticks: null,
  },
  NDVI: {
    description: 'Végétation normalisée (NIR – Rouge). Les valeurs hautes indiquent une végétation dense et saine.',
    stops: NDVI_STOPS,
    ticks: [
      { v: -1,  label: '−1\nSol/eau' },
      { v: 0,   label: '0' },
      { v: 0.5, label: '0,5' },
      { v: 1,   label: '1\nDense' },
    ],
  },
  NDWI: {
    description: 'Eau normalisée (Vert – NIR). Détecte les surfaces en eau libre : mares, canaux, zones inondées. Les valeurs positives (bleu) indiquent la présence d\'eau.',
    stops: NDWI_STOPS,
    ticks: [
      { v: -1, label: '−1\nTerre' },
      { v: 0,  label: '0' },
      { v: 1,  label: '1\nEau' },
    ],
  },
  NDMI: {
    description: 'Humidité normalisée (NIR – SWIR). Indique le stress hydrique des plantes ; les valeurs basses signalent un manque d\'eau.',
    stops: NDMI_STOPS,
    ticks: [
      { v: -1, label: '−1\nStress' },
      { v: 0,  label: '0' },
      { v: 1,  label: '1\nHumide' },
    ],
  },
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



function Legend({ index, width }: { index: IndexType; width: number }) {
  const meta = INDEX_META[index]
  if (!meta.stops || !meta.ticks) {
    return (
      <p className="text-xs text-center leading-relaxed" style={{ color: 'var(--text-muted)' }}>{meta.description}</p>
    )
  }
  const gradient = meta.stops
    .map(s => `rgb(${s.r},${s.g},${s.b}) ${Math.round((s.v + 1) / 2 * 100)}%`)
    .join(', ')
  return (
    <div className="flex flex-col gap-1" style={{ width }}>
      <p className="text-xs text-center leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{meta.description}</p>
      <div className="h-4 rounded" style={{ background: `linear-gradient(to right, ${gradient})` }} />
      <div className="flex justify-between">
        {meta.ticks.map(t => (
          <span key={t.v} className="text-xs whitespace-pre-line text-center leading-tight" style={{ color: 'var(--text-muted)' }}>{t.label}</span>
        ))}
      </div>
    </div>
  )
}

export default function ParcelImageViewer({ item, parcelGeometry, index }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [squareSize, setSquareSize] = useState(0)
  const [progress, setProgress] = useState<{ pct: number; label: string }>({ pct: 0, label: '' })
  const [drawInfo, setDrawInfo] = useState<{
    parcelCRS: [number, number][]
    nativeBbox: number[]
    win: PixelWindow
  } | null>(null)

  useEffect(() => {
    if (!wrapperRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.max(0, Math.floor(entry.contentRect.width))
      const h = Math.max(0, Math.floor(entry.contentRect.height))
      // On desktop the wrapper has md:h-full so h is the available height.
      // Subtract ~100px for the legend + gap below the image.
      // On mobile the wrapper height is unconstrained so h is unreliable — use width only.
      const desktop = window.matchMedia('(min-width: 768px)').matches
      const size = (desktop && h > 100) ? Math.min(w, h - 100) : w
      setSquareSize(prev => prev === size ? prev : size)
    })
    ro.observe(wrapperRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (index === 'RGB' && !item.visualUrl) {
      setErrorMsg('Pas de COG disponible pour cette date.')
      setStatus('error')
      return
    }
    if (index === 'NDVI' && (!item.nirUrl || !item.redUrl)) {
      setErrorMsg('Données de bandes insuffisantes pour calculer le NDVI.')
      setStatus('error')
      return
    }
    if (index === 'NDWI' && (!item.nirUrl || !item.greenUrl)) {
      setErrorMsg('Données de bandes insuffisantes pour calculer le NDWI.')
      setStatus('error')
      return
    }
    if (index === 'NDMI' && (!item.nirUrl || !item.swirUrl)) {
      setErrorMsg('Données de bandes insuffisantes pour calculer le NDMI.')
      setStatus('error')
      return
    }

    setStatus('loading')
    setErrorMsg('')
    setDrawInfo(null)
    setProgress({ pct: 0, label: 'Préparation…' })
    let cancelled = false

    async function load() {
      function report(pct: number, label: string) {
        if (!cancelled) setProgress({ pct, label })
      }

      try {
        const { fromUrl } = await import('geotiff')

        if (index === 'RGB') {
          report(10, 'Ouverture du fichier…')
          const tiff = await fromUrl(item.visualUrl)
          const image = await tiff.getImage()
          const imageWidth = image.getWidth()
          const imageHeight = image.getHeight()
          const nativeBbox = image.getBoundingBox()
          const geoKeys = image.getGeoKeys()
          const epsgCode = geoKeys?.ProjectedCSTypeGeoKey as number | undefined
          const proj4Str = epsgCode ? utmProj4(epsgCode) : null

          const parcelCRS: [number, number][] = parcelGeometry.coordinates[0].map(coord =>
            proj4Str ? proj4('WGS84', proj4Str, [coord[0], coord[1]]) as [number, number] : [coord[0], coord[1]]
          )

          const win = calcWindow(imageWidth, imageHeight, nativeBbox, parcelCRS)
          if (!win) throw new Error('Parcelle hors des limites de la tuile')

          report(35, 'Téléchargement des pixels…')
          const rasters = await image.readRasters({ window: [win.x0, win.y0, win.x1, win.y1], samples: [0, 1, 2] })

          if (cancelled) return
          const canvas = canvasRef.current
          if (!canvas) return

          report(85, 'Rendu…')
          canvas.width = win.w
          canvas.height = win.h

          const r = rasters[0] as Uint8Array | Uint16Array | undefined
          const g = rasters[1] as Uint8Array | Uint16Array | undefined
          const b = rasters[2] as Uint8Array | Uint16Array | undefined
          if (!r || !g || !b) throw new Error('COG sans 3 bandes RGB')
          const isUint16 = r instanceof Uint16Array

          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('Canvas 2D non disponible')
          const imgData = ctx.createImageData(win.w, win.h)

          for (let i = 0; i < win.w * win.h; i++) {
            imgData.data[i * 4]     = stretch(r[i], isUint16)
            imgData.data[i * 4 + 1] = stretch(g[i], isUint16)
            imgData.data[i * 4 + 2] = stretch(b[i], isUint16)
            imgData.data[i * 4 + 3] = 255
          }

          ctx.putImageData(imgData, 0, 0)
          setDrawInfo({ parcelCRS, nativeBbox, win })

        } else {
          const secLabel = index === 'NDVI' ? 'rouge' : index === 'NDWI' ? 'verte' : 'SWIR'

          report(10, 'Ouverture bande NIR…')
          const nirTiff = await fromUrl(item.nirUrl)
          const nirImage = await nirTiff.getImage()
          const nirBbox = nirImage.getBoundingBox()
          const geoKeys = nirImage.getGeoKeys()
          const epsgCode = geoKeys?.ProjectedCSTypeGeoKey as number | undefined
          const proj4Str = epsgCode ? utmProj4(epsgCode) : null

          const parcelCRS: [number, number][] = parcelGeometry.coordinates[0].map(coord =>
            proj4Str ? proj4('WGS84', proj4Str, [coord[0], coord[1]]) as [number, number] : [coord[0], coord[1]]
          )

          const win = calcWindow(nirImage.getWidth(), nirImage.getHeight(), nirBbox, parcelCRS)
          if (!win) throw new Error('Parcelle hors des limites de la tuile')

          report(30, 'Téléchargement bande NIR…')
          const nirRasters = await nirImage.readRasters({ window: [win.x0, win.y0, win.x1, win.y1], width: win.w, height: win.h, samples: [0] })
          const nirBand = nirRasters[0] as Uint16Array | undefined
          if (!nirBand) throw new Error('Bande NIR manquante')

          const secUrl = index === 'NDVI' ? item.redUrl : index === 'NDWI' ? item.greenUrl : item.swirUrl
          report(55, `Ouverture bande ${secLabel}…`)
          const secTiff = await fromUrl(secUrl)
          const secImage = await secTiff.getImage()
          const secBbox = secImage.getBoundingBox()
          const secWin = calcWindow(secImage.getWidth(), secImage.getHeight(), secBbox, parcelCRS)
          if (!secWin) throw new Error('Parcelle hors des limites (bande secondaire)')

          report(70, `Téléchargement bande ${secLabel}…`)
          const secRasters = await secImage.readRasters({
            window: [secWin.x0, secWin.y0, secWin.x1, secWin.y1],
            width: win.w,
            height: win.h,
            samples: [0],
          })
          const secBand = secRasters[0] as Uint16Array | undefined
          if (!secBand) throw new Error('Bande secondaire manquante')

          if (cancelled) return
          const canvas = canvasRef.current
          if (!canvas) return

          report(88, `Calcul ${index}…`)
          canvas.width = win.w
          canvas.height = win.h

          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('Canvas 2D non disponible')
          const imgData = ctx.createImageData(win.w, win.h)

          const stops = index === 'NDVI' ? NDVI_STOPS : index === 'NDWI' ? NDWI_STOPS : NDMI_STOPS

          for (let i = 0; i < win.w * win.h; i++) {
            const nir = nirBand[i]
            const sec = secBand[i]
            const val = index === 'NDWI'
              ? (sec + nir === 0 ? 0 : (sec - nir) / (sec + nir))
              : (nir + sec === 0 ? 0 : (nir - sec) / (nir + sec))
            const [r, g, b] = interpolateColor(val, stops)
            imgData.data[i * 4]     = r
            imgData.data[i * 4 + 1] = g
            imgData.data[i * 4 + 2] = b
            imgData.data[i * 4 + 3] = 255
          }

          report(95, 'Rendu…')
          ctx.putImageData(imgData, 0, 0)
          setDrawInfo({ parcelCRS, nativeBbox: nirBbox, win })
        }

        setStatus('done')
      } catch (e) {
        if (!cancelled) {
          console.error('Erreur chargement COG:', e)
          setErrorMsg("Impossible de charger l'image pour cette date.")
          setStatus('error')
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [item, parcelGeometry, index])

  return (
    <div ref={wrapperRef} className="w-full md:h-full flex flex-col items-center gap-3">
      <div
        className="rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0 relative"
        style={{
          width: squareSize, height: squareSize,
          background: 'rgba(0,0,0,0.03)',
          border: '1px solid var(--glass-border)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        }}
      >
        {status === 'loading' && squareSize > 0 && (
          <div className="flex flex-col items-center gap-2 w-3/4 z-10">
            <div className="w-full rounded-full h-1.5" style={{ background: 'rgba(0,0,0,0.06)' }}>
              <div
                className="h-1.5 rounded-full transition-all duration-300 ease-out animate-pulse-glow"
                style={{ width: `${progress.pct}%`, background: 'var(--accent)' }}
              />
            </div>
            <span className="text-xs z-10" style={{ color: 'var(--text-muted)' }}>{progress.label}</span>
          </div>
        )}
        {status === 'error' && (
          <span className="text-sm px-4 text-center z-10" style={{ color: '#f87171' }}>{errorMsg}</span>
        )}
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          style={{ display: status === 'done' ? 'block' : 'none', width: '100%', height: '100%' }}
        />
        {status === 'done' && drawInfo && (
          <svg
            viewBox={`0 0 ${drawInfo.win.w} ${drawInfo.win.h}`}
            className="absolute inset-0 w-full h-full pointer-events-none"
            preserveAspectRatio="none"
          >
            <polygon
              points={drawInfo.parcelCRS.map(coord => {
                const px = (coord[0] - drawInfo.nativeBbox[0]) * drawInfo.win.scaleX - drawInfo.win.x0
                const py = (drawInfo.nativeBbox[3] - coord[1]) * drawInfo.win.scaleY - drawInfo.win.y0
                return `${px},${py}`
              }).join(' ')}
              fill="none"
              stroke="rgba(255, 220, 0, 0.95)"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      {squareSize > 0 && <Legend index={index} width={squareSize} />}
    </div>
  )
}
