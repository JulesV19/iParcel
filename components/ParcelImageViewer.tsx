'use client'

import { useEffect, useRef, useState } from 'react'
import type { SentinelItem } from '@/lib/stac'

interface Props {
  item: SentinelItem
  parcelGeometry: GeoJSON.Polygon
}

function getParcelBbox(geometry: GeoJSON.Polygon): [number, number, number, number] {
  const coords = geometry.coordinates[0]
  const lons = coords.map(c => c[0])
  const lats = coords.map(c => c[1])
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
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

        const [tileMinLon, , tileMaxLon, tileMaxLat] = item.bbox
        const [pMinLon, pMinLat, pMaxLon, pMaxLat] = getParcelBbox(parcelGeometry)

        const scaleX = imageWidth / (tileMaxLon - tileMinLon)
        const scaleY = imageHeight / (item.bbox[3] - item.bbox[1])

        let x0 = Math.floor((pMinLon - tileMinLon) * scaleX)
        let x1 = Math.ceil((pMaxLon - tileMinLon) * scaleX)
        let y0 = Math.floor((tileMaxLat - pMaxLat) * scaleY)
        let y1 = Math.ceil((tileMaxLat - pMinLat) * scaleY)

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

        // Dessin du contour de la parcelle
        const coords = parcelGeometry.coordinates[0]
        ctx.beginPath()
        coords.forEach((coord, i) => {
          const cx = (coord[0] - tileMinLon) * scaleX - x0
          const cy = (tileMaxLat - coord[1]) * scaleY - y0
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
