'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet-draw'
import type { Parcel } from '@/lib/types'
import { fetchRpgParcels, pickPolygon, RPG_MIN_ZOOM, type RpgFeature, type RpgPick } from '@/lib/rpg'

const SIGNAL = '#f5d04a'
const HALO = '#0b0f0c'
const FRANCE: L.LatLngTuple = [46.6, 2.4]
const LABEL_MIN_ZOOM = 13

// Géoplateforme IGN (WMTS, sans clé, Licence Ouverte Etalab 2.0) : couverture France
const IGN_WMTS = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'
const ignLayer = (layer: string, format: 'image/jpeg' | 'image/png') => `${IGN_WMTS}&LAYER=${layer}&FORMAT=${format}`
const IGN_ATTRIBUTION = 'Images aériennes et noms © <a href="https://www.ign.fr" target="_blank" rel="noopener noreferrer">IGN</a> – <a href="https://www.etalab.gouv.fr/licence-ouverte-open-licence/" target="_blank" rel="noopener noreferrer">Licence Ouverte</a>'
const RPG_ATTRIBUTION = 'Registre parcellaire graphique : ASP, <a href="https://geoservices.ign.fr/rpg" target="_blank" rel="noopener noreferrer">IGN</a>'

const rpgStyle = (hover: boolean): L.PathOptions => hover
  ? { color: '#fff', weight: 2.5, opacity: 1, fillColor: '#fff', fillOpacity: 0.18 }
  : { color: '#fff', weight: 1.2, opacity: 0.85, fillColor: '#fff', fillOpacity: 0 }

export type RpgState = 'zoom' | 'loading' | 'ready' | 'dense' | 'error'

L.drawLocal.draw.handlers.polygon.tooltip = {
  start: 'Cliquez pour placer le premier sommet',
  cont: 'Cliquez pour placer le sommet suivant',
  end: 'Cliquez sur le premier sommet pour fermer',
}
L.drawLocal.draw.handlers.polyline.error = '<strong>Les côtés ne peuvent pas se croiser</strong>'

const vertex = L.divIcon({ className: 'draw-vertex', iconSize: [14, 14] })
const touchVertex = L.divIcon({ className: 'draw-vertex', iconSize: [22, 22] })

// leaflet-draw ajoute un gestionnaire d'édition à chaque polygone, absent de ses types
const editing = (poly: L.Polygon) => (poly as L.Polygon & { editing: L.Handler }).editing

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
  startAdjust(geometry: GeoJSON.Polygon): void
  finishAdjust(): GeoJSON.Polygon | null
  cancelAdjust(): void
}

interface Props {
  parcels: Parcel[]
  selectedId: string | null
  /** Parcelle dont l'image est en cours de calcul : contour animé */
  loadingId: string | null
  hoveredId: string | null
  overlay: { url: string; bounds: L.LatLngBoundsLiteral; opacity: number } | null
  draft: GeoJSON.Polygon | null
  /** Contours RPG affichés et cliquables (choix d'une parcelle déclarée à la PAC) */
  rpg: boolean
  insets: MapInsets
  onReady: (api: MapApi) => void
  onSelect: (id: string) => void
  onZoom: (zoom: number) => void
  onHover: (id: string | null) => void
  onDrawProgress: (vertices: [number, number][]) => void
  onDrawComplete: (geometry: GeoJSON.Polygon) => void
  onDrawCancel: () => void
  onRpgState: (state: RpgState) => void
  /** null : clic hors de toute parcelle RPG */
  onRpgPick: (pick: RpgPick | null) => void
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
  const adjustRef = useRef<L.Polygon | null>(null)
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

    L.tileLayer(ignLayer('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg'), {
      attribution: IGN_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map)
    L.tileLayer(ignLayer('GEOGRAPHICALNAMES.NAMES', 'image/png'), {
      maxNativeZoom: 18,
      maxZoom: 19,
    }).addTo(map)

    map.createPane('sentinel').style.zIndex = '390'
    map.createPane('rpg').style.zIndex = '380'

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
      startAdjust(geometry) {
        api.cancelAdjust()
        const options: L.PolylineOptions & { poly: L.EditToolbar.EditPolyOptions } = {
          color: SIGNAL, weight: 2.5, opacity: 1, fillColor: SIGNAL, fillOpacity: 0.18,
          poly: { allowIntersection: false, icon: vertex, touchIcon: touchVertex, drawError: { color: '#e5533d', timeout: 1600 } },
        }
        const poly = L.polygon(toLatLngs(geometry), options).addTo(map)
        editing(poly).enable()
        adjustRef.current = poly
        containerRef.current?.classList.add('drawing')
      },
      finishAdjust() {
        const poly = adjustRef.current
        if (!poly) return null
        const geometry = poly.toGeoJSON().geometry as GeoJSON.Polygon
        api.cancelAdjust()
        return geometry
      },
      cancelAdjust() {
        const poly = adjustRef.current
        if (!poly) return
        editing(poly).disable()
        poly.remove()
        adjustRef.current = null
        containerRef.current?.classList.remove('drawing')
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
      adjustRef.current = null
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
      const shape = L.polygon(latlngs, { ...parcelStyle('idle'), className: 'parcel-shape' })
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

  // ─── Parcelles déclarées à la PAC (RPG) ────────────────────
  useEffect(() => {
    const map = mapRef.current
    const container = containerRef.current
    if (!map || !container || !props.rpg) return
    container.classList.add('picking')

    let state: RpgState | null = null
    const report = (s: RpgState) => {
      state = s
      latest.current.onRpgState(s)
    }

    let hovered: L.Path | null = null
    // Options de tracé transmises à chaque polygone créé, absentes des types de L.geoJSON
    const options: L.GeoJSONOptions<RpgFeature['properties']> & L.PathOptions = {
      renderer: L.canvas({ pane: 'rpg', padding: 0.3 }),
      style: rpgStyle(false),
      // Le clic sur une parcelle ne doit pas aussi compter comme un clic dans le vide
      bubblingMouseEvents: false,
      attribution: RPG_ATTRIBUTION,
      onEachFeature: (feature, l) => {
        const path = l as L.Path
        path.on('mouseover', () => { hovered = path; path.setStyle(rpgStyle(true)) })
        path.on('mouseout', () => { if (hovered === path) hovered = null; path.setStyle(rpgStyle(false)) })
        path.on('click', e => {
          const { lng, lat } = (e as L.LeafletMouseEvent).latlng
          const geometry = feature.geometry as RpgFeature['geometry']
          latest.current.onRpgPick({ geometry: pickPolygon(geometry, [lng, lat]), culture: feature.properties.code_cultu ?? null })
        })
      },
    }
    const layer = L.geoJSON(undefined, options).addTo(map)

    // Emprise déjà chargée, avec une marge : un petit déplacement ne relance pas de requête
    let loaded: L.LatLngBounds | null = null
    let ctrl: AbortController | null = null
    const load = () => {
      if (map.getZoom() < RPG_MIN_ZOOM) {
        ctrl?.abort()
        layer.clearLayers()
        loaded = null
        report('zoom')
        return
      }
      if (loaded?.contains(map.getBounds())) return
      ctrl?.abort()
      const c = ctrl = new AbortController()
      const target = map.getBounds().pad(0.3)
      report('loading')
      fetchRpgParcels({ south: target.getSouth(), west: target.getWest(), north: target.getNorth(), east: target.getEast() }, c.signal)
        .then(({ features, truncated }) => {
          if (c.signal.aborted) return
          hovered = null
          layer.clearLayers()
          layer.addData({ type: 'FeatureCollection', features } as GeoJSON.FeatureCollection)
          // Zone incomplète : on recharge au prochain déplacement
          loaded = truncated ? null : target
          report(truncated ? 'dense' : 'ready')
        })
        .catch(e => {
          if (c.signal.aborted) return
          console.error('RPG :', e)
          report('error')
        })
    }
    const onMapClick = () => {
      if (state === 'ready' || state === 'dense') latest.current.onRpgPick(null)
    }

    map.on('moveend', load)
    map.on('click', onMapClick)
    load()
    return () => {
      map.off('moveend', load)
      map.off('click', onMapClick)
      ctrl?.abort()
      layer.remove()
      container.classList.remove('picking')
    }
  }, [props.rpg])

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
