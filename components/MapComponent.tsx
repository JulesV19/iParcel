'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet-draw'
import { supabase } from '@/lib/supabase'
import type { Parcel } from '@/lib/types'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export default function MapComponent({ userId, onSaved }: { userId: string; onSaved?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const drawnLayersRef = useRef<L.FeatureGroup>(new L.FeatureGroup())
  const existingLayersRef = useRef<L.FeatureGroup>(new L.FeatureGroup())
  const addedIds = useRef<Set<string>>(new Set())

  const [parcels, setParcels] = useState<Parcel[]>([])
  const [pendingLayer, setPendingLayer] = useState<L.Layer | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [parcelName, setParcelName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    supabase
      .from('parcels')
      .select('id, name, geometry')
      .eq('user_id', userId)
      .then(({ data }) => { if (data) setParcels(data as Parcel[]) })
  }, [userId])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, { center: [46.5, 2.5], zoom: 6 })

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles © Esri', maxZoom: 19 }
    ).addTo(map)

    drawnLayersRef.current.addTo(map)
    existingLayersRef.current.addTo(map)

    const drawControl = new L.Control.Draw({
      draw: {
        polygon: { shapeOptions: { color: '#16a34a' } },
        polyline: false,
        rectangle: false,
        circle: false,
        marker: false,
        circlemarker: false,
      },
      edit: { featureGroup: drawnLayersRef.current, edit: false, remove: false },
    })
    map.addControl(drawControl)

    map.on(L.Draw.Event.CREATED, (e) => {
      const layer = (e as L.DrawEvents.Created).layer
      drawnLayersRef.current.addLayer(layer)
      setPendingLayer(layer)
      setShowModal(true)
      setParcelName('')
      setSaveError('')
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    if (!mapRef.current) return
    parcels.forEach((parcel) => {
      if (addedIds.current.has(parcel.id)) return
      addedIds.current.add(parcel.id)
      L.geoJSON(parcel.geometry as GeoJSON.GeoJsonObject, {
        style: { color: '#16a34a', weight: 2, fillOpacity: 0.2 },
      })
        .bindPopup(`<strong>${escapeHtml(parcel.name)}</strong>`)
        .addTo(existingLayersRef.current)
    })
  }, [parcels])

  async function saveParcel() {
    if (!pendingLayer || !parcelName.trim()) return
    setSaving(true)
    setSaveError('')

    const geometry = (pendingLayer as L.Polygon).toGeoJSON().geometry
    const { data, error } = await supabase
      .from('parcels')
      .insert({ name: parcelName.trim(), geometry, user_id: userId })
      .select('id, name, geometry')
      .single()

    setSaving(false)
    if (error) {
      setSaveError('Erreur lors de l\'enregistrement. Réessayez.')
      return
    }

    if (data) {
      ;(pendingLayer as L.Polygon).setStyle({ color: '#16a34a', weight: 2, fillOpacity: 0.2 })
      ;(pendingLayer as L.Polygon).bindPopup(`<strong>${escapeHtml(data.name)}</strong>`)
      addedIds.current.add(data.id)
      setParcels(prev => [...prev, data as Parcel])
    }

    setShowModal(false)
    setPendingLayer(null)
    setParcelName('')
    onSaved?.()
  }

  function cancelDraw() {
    if (pendingLayer) drawnLayersRef.current.removeLayer(pendingLayer)
    setShowModal(false)
    setPendingLayer(null)
    setParcelName('')
    setSaveError('')
  }

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {showModal && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-[1001]">
          <div className="bg-white rounded-xl shadow-xl p-6 w-80 flex flex-col gap-4">
            <h2 className="font-semibold text-gray-800">Nommer la parcelle</h2>
            <input
              type="text"
              placeholder="Ex: Champ du bas"
              value={parcelName}
              onChange={(e) => setParcelName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveParcel()}
              autoFocus
              className="border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {saveError && <p className="text-sm text-red-500">{saveError}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={cancelDraw} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">
                Annuler
              </button>
              <button
                onClick={saveParcel}
                disabled={!parcelName.trim() || saving}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? '...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
