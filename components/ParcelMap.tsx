'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet-draw'
import type { Parcel } from '@/lib/types'

const SIGNAL = '#f5d04a'
const HALO = '#0b0f0c'
const FRANCE: L.LatLngTuple = [46.6, 2.4]
const LABEL_MIN_ZOOM = 13

L.drawLocal.draw.handlers.polygon.tooltip = {
  start: 'Cliquez pour placer le premier sommet',
  cont: 'Cliquez pour placer le sommet suivant',
  end: 'Cliquez sur le premier sommet pour fermer',
}
L.drawLocal.draw.handlers.polyline.error = '<strong>Les côtés ne peuvent pas se croiser</strong>'

export interface MapInsets { left: number; bottom: number }

export interface MapApi {
  focusParcel(geometry: GeoJSON.Polygon): void
  focusAll(geometries: GeoJSON.Polygon[]): void
  flyTo(lat: number, lon: number, zoom: number): void
  zoomIn(): void
  zoomOut(): void
  locate(): Promise<void>
  startDraw(): void
  undoVertex(): void
  finishDraw(): void
  cancelDraw(): void
}

interface Props {
  parcels: Parcel[]
  selectedId: string | null
  /** Parcelle dont l'image est en cours de calcul : contour animé */
  loadingId: string | null
  hoveredId: string | null
  overlay: { url: string; bounds: L.LatLngBoundsLiteral; opacity: number } | null
  draft: GeoJSON.Polygon | null
  insets: MapInsets
  onReady: (api: MapApi) => void
  onSelect: (id: string) => void
  onZoom: (zoom: number) => void
  onHover: (id: string | null) => void
  onDrawProgress: (vertices: [number, number][]) => void
  onDrawComplete: (geometry: GeoJSON.Polygon) => void
  onDrawCancel: () => void
}

function toLatLngs(geometry: GeoJSON.Polygon): L.LatLngTuple[] {
  return geometry.coordinates[0].map(([lon, lat]) => [lat, lon] as L.LatLngTuple)
}

// Leaflet insère le contenu des tooltips en innerHTML : le nom saisi doit passer en texte brut
function labelNode(name: string): HTMLElement {
  const span = document.createElement('span')
  span.textContent = name
  return span
}

function parcelStyle(state: 'idle' | 'hover' | 'selected' | 'muted'): L.PathOptions {
  switch (state) {
    case 'selected': return { color: SIGNAL, weight: 3, opacity: 1, fillColor: SIGNAL, fillOpacity: 0 }
    case 'hover':    return { color: SIGNAL, weight: 2.5, opacity: 1, fillColor: SIGNAL, fillOpacity: 0.28 }
    case 'muted':    return { color: SIGNAL, weight: 1.5, opacity: 0.55, fillColor: SIGNAL, fillOpacity: 0.04 }
    default:         return { color: SIGNAL, weight: 2, opacity: 0.95, fillColor: SIGNAL, fillOpacity: 0.12 }
  }
}

export default function ParcelMap(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layersRef = useRef(new Map<string, { shape: L.Polygon; halo: L.Polygon }>())
  const overlayRef = useRef<L.ImageOverlay | null>(null)
  const draftRef = useRef<L.Polygon | null>(null)
  const drawRef = useRef<L.Draw.Polygon | null>(null)
  const drawCompletedRef = useRef(false)
  const locateRef = useRef<L.Marker | null>(null)
  // Dernières props, lues par les gestionnaires Leaflet créés une seule fois
  const latest = useRef(props)
  useEffect(() => { latest.current = props })

  function fitOptions(): L.FitBoundsOptions {
    const { left, bottom } = latest.current.insets
    return { paddingTopLeft: [left + 40, 40], paddingBottomRight: [40, bottom + 40], maxZoom: 17 }
  }

  // ─── Création de la carte ──────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const layers = layersRef.current
    const map = L.map(containerRef.current, {
      center: FRANCE,
      zoom: 6,
      zoomControl: false,
      worldCopyJump: true,
    })
    map.attributionControl.setPrefix(false)

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Imagerie © Esri, Maxar, Earthstar Geographics',
      maxZoom: 19,
    }).addTo(map)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      opacity: 0.85,
    }).addTo(map)

    map.createPane('sentinel').style.zIndex = '390'

    const syncLabels = () => {
      containerRef.current?.classList.toggle('show-labels', map.getZoom() >= LABEL_MIN_ZOOM)
      latest.current.onZoom(map.getZoom())
    }
    map.on('zoomend', syncLabels)
    syncLabels()

    const emitVertices = () => {
      // leaflet-draw n'expose pas les sommets en cours : on lit ses marqueurs internes
      const markers = (drawRef.current as unknown as { _markers?: L.Marker[] } | null)?._markers ?? []
      latest.current.onDrawProgress(markers.map(m => {
        const p = m.getLatLng()
        return [p.lng, p.lat]
      }))
    }
    map.on(L.Draw.Event.DRAWVERTEX, emitVertices)
    map.on(L.Draw.Event.CREATED, e => {
      drawCompletedRef.current = true
      const layer = (e as L.DrawEvents.Created).layer as L.Polygon
      latest.current.onDrawComplete(layer.toGeoJSON().geometry as GeoJSON.Polygon)
    })
    map.on(L.Draw.Event.DRAWSTOP, () => {
      containerRef.current?.classList.remove('drawing')
      drawRef.current = null
      if (!drawCompletedRef.current) latest.current.onDrawCancel()
    })

    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(containerRef.current)

    mapRef.current = map

    const api: MapApi = {
      focusParcel(geometry) {
        map.flyToBounds(L.latLngBounds(toLatLngs(geometry)), { ...fitOptions(), duration: 0.9 })
      },
      focusAll(geometries) {
        if (geometries.length === 0) {
          map.setView(FRANCE, 6)
          return
        }
        const b = L.latLngBounds(geometries.flatMap(toLatLngs))
        map.fitBounds(b, { ...fitOptions(), maxZoom: 16 })
      },
      flyTo(lat, lon, zoom) {
        const { left, bottom } = latest.current.insets
        // Décale le centre pour qu'il tombe au milieu de la zone visible, hors panneau
        const target = map.project([lat, lon], zoom).subtract([left / 2, -bottom / 2])
        map.flyTo(map.unproject(target, zoom), zoom, { duration: 1.1 })
      },
      zoomIn() { map.zoomIn() },
      zoomOut() { map.zoomOut() },
      locate() {
        return new Promise((resolve, reject) => {
          if (!navigator.geolocation) { reject(new Error('unsupported')); return }
          navigator.geolocation.getCurrentPosition(
            pos => {
              const { latitude, longitude } = pos.coords
              locateRef.current?.remove()
              locateRef.current = L.marker([latitude, longitude], {
                icon: L.divIcon({ className: 'locate-dot', iconSize: [18, 18] }),
                interactive: false,
                keyboard: false,
              }).addTo(map)
              api.flyTo(latitude, longitude, 16)
              resolve()
            },
            err => reject(err),
            { enableHighAccuracy: true, timeout: 10_000 },
          )
        })
      },
      startDraw() {
        drawRef.current?.disable()
        drawCompletedRef.current = false
        const vertex = L.divIcon({ className: 'draw-vertex', iconSize: [14, 14] })
        const touchVertex = L.divIcon({ className: 'draw-vertex', iconSize: [22, 22] })
        const handler = new L.Draw.Polygon(map as L.DrawMap, {
          allowIntersection: false,
          showArea: false,
          guidelineDistance: 14,
          icon: vertex,
          touchIcon: touchVertex,
          shapeOptions: { color: SIGNAL, weight: 2.5, opacity: 1, fillColor: SIGNAL, fillOpacity: 0.18 },
          drawError: { color: '#e5533d', timeout: 1600 },
        })
        drawRef.current = handler
        containerRef.current?.classList.add('drawing')
        handler.enable()
        latest.current.onDrawProgress([])
      },
      undoVertex() {
        drawRef.current?.deleteLastVertex()
        emitVertices()
      },
      finishDraw() {
        drawRef.current?.completeShape()
      },
      cancelDraw() {
        drawRef.current?.disable()
      },
    }
    latest.current.onReady(api)

    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
      layers.clear()
      overlayRef.current = null
      draftRef.current = null
      locateRef.current = null
    }
  }, [])

  // ─── Parcelles ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const layers = layersRef.current
    const ids = new Set(props.parcels.map(p => p.id))

    for (const [id, l] of layers) {
      if (!ids.has(id)) {
        l.shape.remove()
        l.halo.remove()
        layers.delete(id)
      }
    }

    for (const parcel of props.parcels) {
      const existing = layers.get(parcel.id)
      if (existing) {
        existing.shape.setTooltipContent(labelNode(parcel.name))
        continue
      }
      const latlngs = toLatLngs(parcel.geometry)
      const halo = L.polygon(latlngs, { color: HALO, weight: 5, opacity: 0.35, fill: false, interactive: false }).addTo(map)
      const shape = L.polygon(latlngs, parcelStyle('idle'))
        .bindTooltip(labelNode(parcel.name), { permanent: true, direction: 'center', className: 'parcel-label', interactive: false })
        .on('click', () => latest.current.onSelect(parcel.id))
        .on('mouseover', () => latest.current.onHover(parcel.id))
        .on('mouseout', () => latest.current.onHover(null))
        .addTo(map)
      layers.set(parcel.id, { shape, halo })
    }
  }, [props.parcels])

  useEffect(() => {
    for (const [id, { shape }] of layersRef.current) {
      const state = id === props.selectedId ? 'selected'
        : id === props.hoveredId ? 'hover'
        : props.selectedId ? 'muted'
        : 'idle'
      shape.setStyle(parcelStyle(state))
      shape.getElement()?.classList.toggle('parcel-loading', id === props.loadingId)
      if (state === 'selected') shape.bringToFront()
    }
  }, [props.parcels, props.selectedId, props.hoveredId, props.loadingId])

  // ─── Image Sentinel posée sur la parcelle ──────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const ov = props.overlay
    if (!ov) {
      overlayRef.current?.remove()
      overlayRef.current = null
      return
    }
    if (overlayRef.current) {
      overlayRef.current.setUrl(ov.url)
      overlayRef.current.setBounds(L.latLngBounds(ov.bounds))
      overlayRef.current.setOpacity(ov.opacity)
    } else {
      overlayRef.current = L.imageOverlay(ov.url, ov.bounds, {
        pane: 'sentinel',
        className: 'sentinel-overlay',
        opacity: ov.opacity,
        interactive: false,
      }).addTo(map)
    }
  }, [props.overlay])

  // ─── Parcelle dessinée en attente de nom ───────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    draftRef.current?.remove()
    draftRef.current = props.draft
      ? L.polygon(toLatLngs(props.draft), {
          color: SIGNAL, weight: 2.5, dashArray: '6 6', fillColor: SIGNAL, fillOpacity: 0.2, interactive: false,
        }).addTo(map)
      : null
  }, [props.draft])

  return <div ref={containerRef} className="absolute inset-0" />
}
