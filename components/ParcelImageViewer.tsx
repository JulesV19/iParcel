'use client'

import { useEffect, useRef, useState } from 'react'
import proj4 from 'proj4'
import type { SentinelItem } from '@/lib/stac'

interface Props {
  item: SentinelItem
  parcelGeometry: GeoJSON.Polygon
}

// Build a proj4 string for WGS84 UTM zones (covers all Sentinel-2 projections)
function utmProj4(epsgCode: number): string | null {
  if (epsgCode >= 32601 && epsgCode <= 32660) {
    return `+proj=utm +zone=${epsgCode - 32600} +datum=WGS84 +units=m +no_defs`
  }
  if (epsgCode >= 32701 && epsgCode <= 32760) {
    return `+proj=utm +zone=${epsgCode - 32700} +south +datum=WGS84 +units=m +no_defs`
  }
  return null
}

function stretch(value: number, isUint16: boolean): number {
  if (!isUint16) return Math.min(255, Math.max(0, value))
  return Math.min(255, Math.round((value / 3000) * 255))
}

export default function ParcelImageViewer({ item, parcelGeometry }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [squareSize, setSquareSize] = useState(0)

  useEffect(() => {
    if (!wrapperRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSquareSize(Math.floor(Math.min(width, height)))
    })
    ro.observe(wrapperRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!item.visualUrl) {
      setErrorMsg('Pas de COG disponible pour cette date.')
      setStatus('error')
      return
    }

    setStatus('loading')
    setErrorMsg('')
    let cancelled = false

    async function load() {
      try {
        const { fromUrl } = await import('geotiff')
        const tiff = await fromUrl(item.visualUrl)
        const image = await tiff.getImage()

        const imageWidth = image.getWidth()
        const imageHeight = image.getHeight()

        // Use the image's own bounding box (native CRS — UTM for Sentinel-2)
        const nativeBbox = image.getBoundingBox() // [minX, minY, maxX, maxY]
        const geoKeys = image.getGeoKeys()
        const epsgCode = geoKeys?.ProjectedCSTypeGeoKey as number | undefined

        const proj4Str = epsgCode ? utmProj4(epsgCode) : null

        // Convert parcel WGS84 coords → image CRS
        const rawCoords = parcelGeometry.coordinates[0]
        const imageCRSCoords: [number, number][] = rawCoords.map(coord => {
          if (proj4Str) return proj4('WGS84', proj4Str, [coord[0], coord[1]]) as [number, number]
          return [coord[0], coord[1]]
        })

        const xs = imageCRSCoords.map(c => c[0])
        const ys = imageCRSCoords.map(c => c[1])
        const pMinX = Math.min(...xs)
        const pMaxX = Math.max(...xs)
        const pMinY = Math.min(...ys)
        const pMaxY = Math.max(...ys)

        if (imageWidth === 0 || imageHeight === 0) throw new Error('Image COG de dimensions nulles')
        const bboxW = nativeBbox[2] - nativeBbox[0]
        const bboxH = nativeBbox[3] - nativeBbox[1]
        if (bboxW === 0 || bboxH === 0) throw new Error('Bounding box COG dégénéré')

        // nativeBbox[3] = maxY = top of image in CRS (north)
        const scaleX = imageWidth / bboxW
        const scaleY = imageHeight / bboxH

        const rawX0 = Math.floor((pMinX - nativeBbox[0]) * scaleX)
        const rawX1 = Math.ceil((pMaxX - nativeBbox[0]) * scaleX)
        const rawY0 = Math.floor((nativeBbox[3] - pMaxY) * scaleY)
        const rawY1 = Math.ceil((nativeBbox[3] - pMinY) * scaleY)

        // Square window centered on the parcel bbox, 10% margin on each side
        const cx = (rawX0 + rawX1) / 2
        const cy = (rawY0 + rawY1) / 2
        const halfSide = Math.ceil(Math.max(rawX1 - rawX0, rawY1 - rawY0, 10) / 2 * 1.1)

        const x0 = Math.max(0, Math.round(cx - halfSide))
        const x1 = Math.min(imageWidth, Math.round(cx + halfSide))
        const y0 = Math.max(0, Math.round(cy - halfSide))
        const y1 = Math.min(imageHeight, Math.round(cy + halfSide))

        if (x1 <= x0 || y1 <= y0) throw new Error('Parcelle hors des limites de la tuile')

        const w = x1 - x0
        const h = y1 - y0

        const rasters = await image.readRasters({
          window: [x0, y0, x1, y1],
          samples: [0, 1, 2],
        })

        if (cancelled) return

        const canvas = canvasRef.current
        if (!canvas) return

        canvas.width = w
        canvas.height = h

        const r = rasters[0] as Uint8Array | Uint16Array | undefined
        const g = rasters[1] as Uint8Array | Uint16Array | undefined
        const b = rasters[2] as Uint8Array | Uint16Array | undefined
        if (!r || !g || !b) throw new Error('COG sans 3 bandes RGB')
        const isUint16 = r instanceof Uint16Array

        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas 2D non disponible')
        const imgData = ctx.createImageData(w, h)

        for (let i = 0; i < w * h; i++) {
          imgData.data[i * 4]     = stretch(r[i], isUint16)
          imgData.data[i * 4 + 1] = stretch(g[i], isUint16)
          imgData.data[i * 4 + 2] = stretch(b[i], isUint16)
          imgData.data[i * 4 + 3] = 255
        }

        ctx.putImageData(imgData, 0, 0)

        // Draw parcel outline using native CRS coordinates
        ctx.beginPath()
        imageCRSCoords.forEach((coord, i) => {
          const cx = (coord[0] - nativeBbox[0]) * scaleX - x0
          const cy = (nativeBbox[3] - coord[1]) * scaleY - y0
          if (i === 0) ctx.moveTo(cx, cy)
          else ctx.lineTo(cx, cy)
        })
        ctx.closePath()
        ctx.strokeStyle = 'rgba(255, 220, 0, 0.95)'
        ctx.lineWidth = 2
        ctx.stroke()

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
  }, [item, parcelGeometry])

  return (
    <div ref={wrapperRef} className="w-full h-full flex items-center justify-center">
      <div
        className="bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0"
        style={{ width: squareSize, height: squareSize }}
      >
        {status === 'loading' && (
          <span className="text-sm text-gray-400">Chargement de l&apos;image…</span>
        )}
        {status === 'error' && (
          <span className="text-sm text-red-500 px-4 text-center">{errorMsg}</span>
        )}
        <canvas
          ref={canvasRef}
          style={{ display: status === 'done' ? 'block' : 'none', width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}
