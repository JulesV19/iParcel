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
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

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

        // nativeBbox[3] = maxY = top of image in CRS (north)
        const scaleX = imageWidth / (nativeBbox[2] - nativeBbox[0])
        const scaleY = imageHeight / (nativeBbox[3] - nativeBbox[1])

        let x0 = Math.floor((pMinX - nativeBbox[0]) * scaleX)
        let x1 = Math.ceil((pMaxX - nativeBbox[0]) * scaleX)
        let y0 = Math.floor((nativeBbox[3] - pMaxY) * scaleY)
        let y1 = Math.ceil((nativeBbox[3] - pMinY) * scaleY)

        const padX = Math.max(5, Math.round((x1 - x0) * 0.3))
        const padY = Math.max(5, Math.round((y1 - y0) * 0.3))
        x0 = Math.max(0, Math.min(imageWidth - 1, x0 - padX))
        x1 = Math.max(x0 + 1, Math.min(imageWidth, x1 + padX))
        y0 = Math.max(0, Math.min(imageHeight - 1, y0 - padY))
        y1 = Math.max(y0 + 1, Math.min(imageHeight, y1 + padY))

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

        const ctx = canvas.getContext('2d')!
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
        ctx.fillStyle = 'rgba(255, 220, 0, 0.08)'
        ctx.fill()

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

  if (status === 'error') {
    return (
      <div className="flex items-center justify-center min-h-48 text-sm text-red-500 px-4 text-center">
        {errorMsg}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center bg-gray-100">
      {status === 'loading' && (
        <div className="flex items-center justify-center h-48">
          <span className="text-sm text-gray-400">Chargement de l&apos;image…</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{ display: status === 'done' ? 'block' : 'none', width: '33vw', height: 'auto' }}
      />
    </div>
  )
}
