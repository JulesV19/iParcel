'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { fetchSentinelDates, formatDate } from '@/lib/stac'
import type { SentinelItem } from '@/lib/stac'
import type { Parcel, Intervention, InterventionCategory } from '@/lib/types'
import ParcelImageViewer, { type IndexType } from '@/components/ParcelImageViewer'
import InterventionModal from '@/components/InterventionModal'
import InterventionDetailModal from '@/components/InterventionDetailModal'
import {
  Sun, Cloud, CloudSun, CloudRain, CloudSnow, CloudLightning, CloudDrizzle, CloudFog,
  type LucideIcon,
} from 'lucide-react'
import {
  fetchWeather, parcelCentroid, weatherCodeLabel,
  type WeatherData,
} from '@/lib/weather'

interface Selection {
  item: SentinelItem | null
  parcel: Parcel
}

type WeatherState = WeatherData | 'loading' | 'error' | null

const WMO_MAP: Array<[number, LucideIcon, string]> = [
  [0,        Sun,            'text-amber-400'],
  [2,        CloudSun,       'text-amber-300'],
  [3,        Cloud,          'text-gray-400' ],
  [48,       CloudFog,       'text-gray-400' ],
  [55,       CloudDrizzle,   'text-blue-300' ],
  [67,       CloudRain,      'text-blue-500' ],
  [77,       CloudSnow,      'text-blue-300' ],
  [82,       CloudRain,      'text-blue-500' ],
  [86,       CloudSnow,      'text-blue-300' ],
  [Infinity, CloudLightning, 'text-amber-500'],
]

function wmoStyle(code: number): { Icon: LucideIcon; color: string } {
  const entry = WMO_MAP.find(([max]) => code <= max) ?? WMO_MAP[WMO_MAP.length - 1]
  return { Icon: entry[1], color: entry[2] }
}

function WeatherIcon({ code, size }: { code: number; size: number }) {
  const { Icon, color } = wmoStyle(code)
  return <Icon size={size} className={color} />
}

function dayLabel(dateStr: string, todayStr: string): string {
  const diff = Math.round((new Date(dateStr + 'T12:00:00').getTime() - new Date(todayStr + 'T12:00:00').getTime()) / 86_400_000)
  if (diff === 0) return 'Auj.'
  if (diff === -1) return 'Hier'
  if (diff === -2) return 'Av.-h.'
  if (diff === 1) return 'Dem.'
  if (diff === 2) return 'Ap.-d.'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short' })
}

function WeatherCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--text-muted)' }}>Météo locale</p>
      {children}
    </div>
  )
}

function WeatherPanel({ data }: { data: WeatherData }) {
  const today = data.days[data.todayIndex]
  if (!today) return null
  return (
    <WeatherCard>
      <div className="flex items-start gap-3 mb-4">
        <WeatherIcon code={data.current.weatherCode} size={32} />
        <div>
          <p className="text-xs leading-tight" style={{ color: 'var(--text-secondary)' }}>{weatherCodeLabel(data.current.weatherCode)}</p>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{today.tempMin}° / {today.tempMax}°</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Ressenti {data.current.apparentTemp}°</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{today.precipMm} mm · {data.current.humidity}% hum.</p>
        </div>
      </div>
      <div className="flex gap-1">
        {([-2, -1, 0, 1, 2] as const).map(offset => {
          const day = data.days[data.todayIndex + offset]
          const isToday = offset === 0
          return (
            <div
              key={offset}
              className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg"
              style={isToday ? {
                background: 'var(--accent-bg)',
                border: '1px solid var(--accent-border)',
              } : {
                background: 'rgba(0,0,0,0.02)',
              }}
            >
              {day ? (
                <>
                  <span className="text-[10px] font-medium" style={{ color: isToday ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {dayLabel(day.date, today.date)}
                  </span>
                  <WeatherIcon code={day.weatherCode} size={16} />
                  <span className="text-[10px] font-semibold" style={{ color: 'var(--text-primary)' }}>{day.tempMax}°</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{day.tempMin}°</span>
                  <span className="text-[10px] text-blue-400">{day.precipMm} mm</span>
                </>
              ) : (
                <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>—</span>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-right mt-2" style={{ color: 'var(--text-faint)' }}>Open-Meteo</p>
    </WeatherCard>
  )
}

function formatNoteDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function parcelAreaHa(geometry: GeoJSON.Polygon): string {
  const coords = geometry.coordinates[0]
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
  const ha = Math.abs(area) * R * R / 2 / 10_000
  if (ha < 0.01) return `${Math.round(ha * 10_000)} m²`
  return `${ha.toFixed(2)} ha`
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 last:border-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-xs font-medium text-right" style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

function pct(n: number | null): string {
  return n !== null ? `${Math.round(n * 10) / 10} %` : '—'
}

const CATEGORY_LABELS: Record<InterventionCategory, string> = {
  travail_sol:      'Travail du sol',
  semis:            'Semis',
  fertilisation:    'Fertilisation',
  traitement_phyto: 'Traitement phyto',
  irrigation:       'Irrigation',
  recolte:          'Récolte',
  observation:      'Observation',
  autre:            'Autre',
}

const CATEGORY_BORDER: Record<InterventionCategory, string> = {
  travail_sol:      'border-amber-400',
  semis:            'border-green-400',
  fertilisation:    'border-blue-400',
  traitement_phyto: 'border-red-400',
  irrigation:       'border-cyan-400',
  recolte:          'border-yellow-400',
  observation:      'border-purple-400',
  autre:            'border-gray-300',
}

function InterventionCard({ i, onClick }: { i: Intervention; onClick: () => void }) {
  const detail = (() => {
    if (i.category === 'traitement_phyto') return i.phyto_produit_nom ?? ''
    if (i.category === 'fertilisation')    return i.ferti_produit ?? ''
    if (i.category === 'semis')            return i.semis_variete ?? ''
    if (i.category === 'recolte' && i.recolte_rendement_value)
      return `${i.recolte_rendement_value} ${i.recolte_rendement_unit ?? 't/ha'}`
    return ''
  })()
  return (
    <li
      className={`border-l-2 pl-2 pr-1 py-1 rounded-r cursor-pointer transition-colors ${CATEGORY_BORDER[i.category]}`}
      style={{ background: 'rgba(0,0,0,0.02)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
      onClick={onClick}
    >
      <p className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>{formatNoteDate(i.date)}</p>
      <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
        {CATEGORY_LABELS[i.category]}
        {i.sub_type && <span className="font-normal" style={{ color: 'var(--text-secondary)' }}> · {i.sub_type}</span>}
      </p>
      {i.culture && (
        <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
          {i.culture}{i.stade_bbch ? ` · ${i.stade_bbch}` : ''}
        </p>
      )}
      {detail && <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{detail}</p>}
    </li>
  )
}

export default function Home() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [parcels, setParcels] = useState<Parcel[]>([])
  const [dates, setDates] = useState<Record<string, SentinelItem[]>>({})
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<IndexType>('RGB')
  const fetchedIds = useRef(new Set<string>())
  const weatherCache = useRef<Record<string, WeatherData>>({})
  const lastWeatherParcelId = useRef<string | null>(null)
  const [currentWeather, setCurrentWeather] = useState<WeatherState>(null)
  const [allWeather, setAllWeather] = useState<Record<string, WeatherData>>({})
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [userId, setUserId] = useState('')
  const [interventions, setInterventions] = useState<Record<string, Intervention[]>>({})
  const [showInterventionModal, setShowInterventionModal] = useState(false)
  const [viewingIntervention, setViewingIntervention] = useState<Intervention | null>(null)
  const [editingIntervention, setEditingIntervention] = useState<Intervention | null>(null)
  const fetchedInterventionIds = useRef(new Set<string>())

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setEmail(session.user.email ?? '')
      const uid = session.user.id
      setUserId(uid)
      supabase
        .from('parcels')
        .select('id, name, geometry')
        .eq('user_id', uid)
        .then(({ data, error }) => {
          if (error) {
            setFetchError('Impossible de charger vos parcelles. Vérifiez votre connexion.')
            setLoading(false)
            return
          }
          const valid = (data ?? []).filter(p =>
            p.geometry &&
            typeof p.geometry === 'object' &&
            (p.geometry as { type?: string }).type === 'Polygon'
          )
          setParcels(valid as Parcel[])
          setLoading(false)
        })
    })
  }, [router])

  useEffect(() => {
    const parcelId = selection?.parcel.id ?? null
    if (parcelId === null) {
      setCurrentWeather(null)
      lastWeatherParcelId.current = null
      return
    }
    if (parcelId === lastWeatherParcelId.current) return
    lastWeatherParcelId.current = parcelId
    const cached = weatherCache.current[parcelId]
    if (cached) { setCurrentWeather(cached); return }
    setCurrentWeather('loading')
    const [lat, lon] = parcelCentroid(selection!.parcel.geometry)
    fetchWeather(lat, lon)
      .then(data => {
        weatherCache.current[parcelId] = data
        setAllWeather(prev => ({ ...prev, [parcelId]: data }))
        if (lastWeatherParcelId.current === parcelId) setCurrentWeather(data)
      })
      .catch(() => {
        if (lastWeatherParcelId.current === parcelId) setCurrentWeather('error')
      })
  }, [selection?.parcel.id])

  useEffect(() => {
    setRenaming(false)
    setShowInterventionModal(false)
    setViewingIntervention(null)
    setEditingIntervention(null)
  }, [selection?.parcel.id])

  useEffect(() => {
    const parcelId = selection?.parcel.id
    if (!parcelId || fetchedInterventionIds.current.has(parcelId)) return
    fetchedInterventionIds.current.add(parcelId)
    supabase
      .from('interventions')
      .select('*')
      .eq('parcel_id', parcelId)
      .order('date', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('Interventions fetch error:', error)
        setInterventions(prev => ({ ...prev, [parcelId]: (data ?? []) as Intervention[] }))
      })
  }, [selection?.parcel.id])



  useEffect(() => {
    parcels.forEach(parcel => {
      if (fetchedIds.current.has(parcel.id)) return
      fetchedIds.current.add(parcel.id)
      fetchSentinelDates(parcel.geometry)
        .then(d => setDates(prev => ({ ...prev, [parcel.id]: d })))
        .catch(() => setDates(prev => ({ ...prev, [parcel.id]: [] })))
    })
  }, [parcels])

  // Chargement météo en avance pour toutes les parcelles (mini météo dans la liste)
  useEffect(() => {
    parcels.forEach(parcel => {
      if (weatherCache.current[parcel.id]) {
        setAllWeather(prev => prev[parcel.id] ? prev : { ...prev, [parcel.id]: weatherCache.current[parcel.id]! })
        return
      }
      const [lat, lon] = parcelCentroid(parcel.geometry)
      fetchWeather(lat, lon)
        .then(data => {
          weatherCache.current[parcel.id] = data
          setAllWeather(prev => ({ ...prev, [parcel.id]: data }))
        })
        .catch(() => {})
    })
  }, [parcels])

  // Auto-sélection de la date la plus récente quand les dates se chargent après le clic parcelle
  useEffect(() => {
    if (!selection || selection.item !== null) return
    const parcelDates = dates[selection.parcel.id]
    if (parcelDates?.length) {
      setSelection(prev => prev ? { ...prev, item: parcelDates[0] } : null)
    }
  }, [dates, selection?.parcel.id])

  async function deleteParcel(id: string) {
    if (!window.confirm('Supprimer cette parcelle ?')) return
    const { error } = await supabase.from('parcels').delete().eq('id', id)
    if (error) { alert('Erreur lors de la suppression. Réessayez.'); return }
    setParcels(prev => prev.filter(p => p.id !== id))
    if (selection?.parcel.id === id) setSelection(null)
  }

  async function handleRename(id: string, newName: string) {
    const trimmed = newName.trim()
    if (!trimmed) return
    const { error } = await supabase.from('parcels').update({ name: trimmed }).eq('id', id)
    if (error) { alert('Erreur lors du renommage. Réessayez.'); return }
    setParcels(prev => prev.map(p => p.id === id ? { ...p, name: trimmed } : p))
    setSelection(prev => prev ? { ...prev, parcel: { ...prev.parcel, name: trimmed } } : null)
    setRenaming(false)
  }


  function handleInterventionSaved(intervention: Intervention) {
    const parcelId = intervention.parcel_id
    setInterventions(prev => {
      const existing = prev[parcelId] ?? []
      const idx = existing.findIndex(i => i.id === intervention.id)
      if (idx >= 0) {
        const updated = [...existing]
        updated[idx] = intervention
        return { ...prev, [parcelId]: updated }
      }
      return { ...prev, [parcelId]: [intervention, ...existing] }
    })
  }

  function handleInterventionDeleted(id: string) {
    if (!selection) return
    const parcelId = selection.parcel.id
    setInterventions(prev => ({
      ...prev,
      [parcelId]: (prev[parcelId] ?? []).filter(i => i.id !== id),
    }))
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function handleDeleteAccount() {
    const { error } = await supabase.rpc('delete_user')
    if (error) {
      setAccountError('Erreur lors de la suppression du compte. Réessayez.')
      return
    }
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return (
    <div className="h-screen flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>Chargement…</div>
  )

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="glass px-4 md:px-6 py-3 flex items-center justify-between flex-shrink-0" style={{ borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderRadius: 0 }}>
        <span className="font-bold text-lg" style={{ color: 'var(--accent)' }}>iParcel</span>
        <div className="flex items-center gap-3 md:gap-4 text-sm">
          <span className="hidden sm:inline" style={{ color: 'var(--text-muted)' }}>{email}</span>
          <button onClick={handleLogout} className="text-red-400 hover:text-red-300 transition-colors">
            Se déconnecter
          </button>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="text-xs hidden sm:inline transition-colors" style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              Supprimer mon compte
            </button>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400 font-medium">Supprimer définitivement ?</span>
                <button onClick={handleDeleteAccount} className="text-xs bg-red-500/80 text-white px-2 py-1 rounded hover:bg-red-500 transition-colors">
                  Confirmer
                </button>
                <button onClick={() => { setConfirmDelete(false); setAccountError('') }} className="text-xs px-2 py-1 rounded transition-colors" style={{ border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                  Annuler
                </button>
              </div>
              {accountError && <p className="text-xs text-red-400">{accountError}</p>}
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside className={`flex flex-col overflow-hidden w-full md:w-80 md:flex-shrink-0 ${selection ? 'hidden md:flex' : 'flex'}`} style={{ background: 'rgba(255,255,255,0.40)', borderRight: '1px solid var(--glass-border)' }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--glass-border)' }}>
            <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Mes parcelles</h1>
            <Link href="/map" className="btn-accent px-3 py-2 text-xs rounded-lg">
              + Ajouter
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {fetchError ? (
              <p className="text-red-400 text-sm">{fetchError}</p>
            ) : parcels.length === 0 ? (
              <p className="text-xs mt-4 text-center" style={{ color: 'var(--text-muted)' }}>
                Aucune parcelle. Cliquez sur &ldquo;+ Ajouter&rdquo; pour dessiner votre première parcelle.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {parcels.map(parcel => {
                  const isActive = selection?.parcel.id === parcel.id
                  const parcelDates = dates[parcel.id]
                  const weather = allWeather[parcel.id]
                  const todayWeather = weather ? weather.days[weather.todayIndex] : null
                  return (
                    <li
                      key={parcel.id}
                      onClick={() => setSelection({
                        parcel,
                        item: parcelDates?.[0] ?? null,
                      })}
                      className="rounded-xl p-3 cursor-pointer transition-all duration-200"
                      style={isActive ? {
                        background: 'var(--accent-bg)',
                        border: '1px solid var(--accent-border)',
                        boxShadow: 'var(--accent-glow)',
                      } : {
                        background: 'var(--glass-bg)',
                        border: '1px solid var(--glass-border)',
                      }}
                      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'var(--glass-bg-hover)'; e.currentTarget.style.borderColor = 'var(--glass-border-hover)' } }}
                      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'var(--glass-bg)'; e.currentTarget.style.borderColor = 'var(--glass-border)' } }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{parcel.name}</p>
                          <p className="text-xs" style={{ color: 'var(--accent)' }}>{parcelAreaHa(parcel.geometry)}</p>
                        </div>
                        {todayWeather && (
                          <div className="flex items-center gap-1 shrink-0">
                            <WeatherIcon code={todayWeather.weatherCode} size={14} />
                            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{todayWeather.tempMin}°/{todayWeather.tempMax}°</span>
                          </div>
                        )}
                      </div>
                      {parcelDates === undefined && (
                        <p className="text-[10px] mt-1" style={{ color: 'var(--text-faint)' }}>Chargement des images…</p>
                      )}
                      {parcelDates?.length === 0 && (
                        <p className="text-[10px] mt-1" style={{ color: 'var(--text-faint)' }}>Aucune image disponible</p>
                      )}
                      {parcelDates?.length > 0 && (
                        <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{parcelDates.length} image{parcelDates.length > 1 ? 's' : ''} disponible{parcelDates.length > 1 ? 's' : ''}</p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>

        <main className={`flex-1 flex flex-col ${!selection ? 'hidden md:flex md:overflow-hidden' : 'overflow-y-auto md:overflow-hidden'}`}>
          {!selection ? (
            <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--text-faint)' }}>
              Sélectionnez une parcelle pour afficher le tableau de bord
            </div>
          ) : (
            <>
              <button
                onClick={() => setSelection(null)}
                className="md:hidden flex items-center gap-1 px-4 py-3 text-sm flex-shrink-0 transition-colors"
                style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--glass-border)' }}
              >
                ← Mes parcelles
              </button>

              {/* Layout deux colonnes : contenu principal + panneau droit */}
              <div className="flex flex-col md:flex-row md:flex-1 md:min-h-0 md:overflow-hidden">
                {/* Colonne gauche : header + sélecteurs + image */}
                <div className="flex-1 flex flex-col md:min-w-0 md:overflow-y-auto">
                  {/* Header parcelle */}
                  <div className="px-4 md:px-6 pt-4 md:pt-6 pb-3 flex-shrink-0">
                    <div>
                      {renaming ? (
                        <div className="flex items-center gap-2 mb-0.5">
                          <input
                            type="text"
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && renameValue.trim()) handleRename(selection.parcel.id, renameValue)
                              if (e.key === 'Escape') setRenaming(false)
                            }}
                            autoFocus
                            className="input-glass rounded-lg px-2 py-1 text-sm w-48"
                          />
                          <button onClick={() => handleRename(selection.parcel.id, renameValue)} disabled={!renameValue.trim()} className="text-xs hover:underline disabled:opacity-40 disabled:cursor-not-allowed" style={{ color: 'var(--accent)' }}>Valider</button>
                          <button onClick={() => setRenaming(false)} className="text-xs hover:underline" style={{ color: 'var(--text-muted)' }}>Annuler</button>
                        </div>
                      ) : (
                        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{selection.parcel.name}</h2>
                      )}
                      <p className="text-xs" style={{ color: 'var(--accent)' }}>{parcelAreaHa(selection.parcel.geometry)}</p>
                      {!renaming && (
                        <div className="flex gap-3 mt-1">
                          <button
                            onClick={() => { setRenaming(true); setRenameValue(selection.parcel.name) }}
                            className="text-xs transition-colors"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                          >
                            Renommer
                          </button>
                          <button
                            onClick={() => deleteParcel(selection.parcel.id)}
                            className="text-xs text-red-400 hover:text-red-300 transition-colors"
                          >
                            Supprimer
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Widget dates Sentinel */}
                  <div className="pb-3 flex-shrink-0 w-full">
                    {dates[selection.parcel.id] === undefined ? (
                      <p className="text-xs px-4 md:px-6" style={{ color: 'var(--text-faint)' }}>Chargement des images…</p>
                    ) : dates[selection.parcel.id].length === 0 ? (
                      <p className="text-xs px-4 md:px-6" style={{ color: 'var(--text-faint)' }}>Aucune image disponible</p>
                    ) : (
                      <div className="flex gap-2 overflow-x-auto -my-4 hide-scrollbar">
                        <div className="w-2 md:w-4 shrink-0" />
                        {dates[selection.parcel.id].map(item => {
                          const active = selection.item?.date === item.date
                          return (
                            <button
                              key={item.date}
                              onClick={() => setSelection(prev => prev ? { ...prev, item } : null)}
                              className={`inline-flex items-center gap-1 px-3 py-2 my-4 rounded-lg text-xs font-medium shrink-0 transition-all duration-200 ${active ? 'pill-active' : 'pill-glass'}`}
                            >
                              {formatDate(item.date)}
                              {item.cloudCover !== null && (
                                <span className={`inline-flex items-center gap-0.5 ${active ? 'opacity-80' : 'opacity-50'}`}>
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                                    <path d="M4.5 10.196A6 6 0 0 1 12 4a6 6 0 0 1 5.985 5.57A4.5 4.5 0 0 1 17.5 19H6a4.5 4.5 0 0 1-1.5-8.804Z" />
                                  </svg>
                                  {Math.round(item.cloudCover)}%
                                </span>
                              )}
                            </button>
                          )
                        })}
                        <div className="w-2 md:w-4 shrink-0" />
                      </div>
                    )}
                  </div>

                  {/* Sélecteur d'indice */}
                  <div className="px-4 md:px-6 pb-3 flex-shrink-0">
                    <div className="flex gap-1">
                      {(['RGB', 'NDVI', 'NDWI', 'NDMI'] as const).map(idx => (
                        <button
                          key={idx}
                          onClick={() => setSelectedIndex(idx)}
                          className={`flex-1 md:flex-initial px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${selectedIndex === idx ? 'pill-active' : 'pill-glass'}`}
                        >
                          {idx}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Image parcelle */}
                  <div className="px-4 md:px-6 pb-6 md:flex-1 md:min-h-0">
                    {selection.item ? (
                      <ParcelImageViewer item={selection.item} parcelGeometry={selection.parcel.geometry} index={selectedIndex} />
                    ) : (
                      <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--text-faint)' }}>Chargement des images…</div>
                    )}
                  </div>
                </div>

                {/* Colonne droite : panneau pleine hauteur */}
                <div className="md:w-80 md:flex-shrink-0 flex flex-col gap-3 md:overflow-y-auto px-4 md:px-0 md:pr-6 pb-6 md:pt-6">
                  {selection.item && (
                  <div className="glass rounded-2xl p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Métadonnées</p>
                    {selection.item.platform && (
                      <MetaRow label="Satellite" value={selection.item.platform.replace('sentinel-', 'Sentinel-').toUpperCase()} />
                    )}
                    {selection.item.sunElevation !== null && (
                      <MetaRow label="Élévation soleil" value={`${Math.round(selection.item.sunElevation)}°`} />
                    )}
                    <MetaRow label="Couverture nuageuse" value={pct(selection.item.cloudCover)} />
                    <MetaRow label="Ombres nuages" value={pct(selection.item.cloudShadow)} />
                    <MetaRow label="Végétation" value={pct(selection.item.vegetation)} />
                    <MetaRow label="Eau" value={pct(selection.item.water)} />
                    <MetaRow label="Neige / glace" value={pct(selection.item.snow)} />
                    <MetaRow label="Pixels sans donnée" value={pct(selection.item.nodata)} />
                  </div>
                  )}
                  {currentWeather === 'loading' && (
                    <WeatherCard>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
                    </WeatherCard>
                  )}
                  {currentWeather === 'error' && (
                    <WeatherCard>
                      <p className="text-xs text-red-400">Météo indisponible</p>
                    </WeatherCard>
                  )}
                  {currentWeather !== null && currentWeather !== 'loading' && currentWeather !== 'error' && (
                    <WeatherPanel data={currentWeather} />
                  )}

                  <div className="glass rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Interventions</p>
                      <button
                        onClick={() => setShowInterventionModal(true)}
                        className="btn-accent text-xs px-2 py-1 rounded-lg"
                      >
                        + Nouvelle
                      </button>
                    </div>
                    {interventions[selection.parcel.id] === undefined ? (
                      <p className="text-xs text-center" style={{ color: 'var(--text-faint)' }}>Chargement…</p>
                    ) : interventions[selection.parcel.id].length === 0 ? (
                      <p className="text-xs text-center" style={{ color: 'var(--text-faint)' }}>Aucune intervention</p>
                    ) : (
                      <ul className="flex flex-col gap-3">
                        {interventions[selection.parcel.id].map(intv => (
                          <InterventionCard key={intv.id} i={intv} onClick={() => setViewingIntervention(intv)} />
                        ))}
                      </ul>
                    )}
                  </div>

                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {viewingIntervention && (
        <InterventionDetailModal
          intervention={viewingIntervention}
          onClose={() => setViewingIntervention(null)}
          onEdit={() => { setEditingIntervention(viewingIntervention); setViewingIntervention(null) }}
          onDeleted={handleInterventionDeleted}
        />
      )}

      {(showInterventionModal || editingIntervention) && selection && (
        <InterventionModal
          parcelId={selection.parcel.id}
          userId={userId}
          currentWeather={currentWeather !== 'loading' && currentWeather !== 'error' ? currentWeather : null}
          intervention={editingIntervention ?? undefined}
          onClose={() => { setShowInterventionModal(false); setEditingIntervention(null) }}
          onSaved={intervention => { handleInterventionSaved(intervention); setEditingIntervention(null) }}
        />
      )}

      <footer className="flex-shrink-0 px-6 py-2 flex gap-4 justify-center" style={{ borderTop: '1px solid var(--glass-border)' }}>
        <Link href="/mentions-legales" className="text-xs transition-colors" style={{ color: 'var(--text-muted)' }}>Mentions légales</Link>
        <Link href="/confidentialite" className="text-xs transition-colors" style={{ color: 'var(--text-muted)' }}>Confidentialité</Link>
        <Link href="/cgu" className="text-xs transition-colors" style={{ color: 'var(--text-muted)' }}>CGU</Link>
      </footer>
    </div>
  )
}
