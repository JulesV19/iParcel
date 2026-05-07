'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { fetchSentinelDates, formatDate } from '@/lib/stac'
import type { SentinelItem } from '@/lib/stac'
import type { Parcel } from '@/lib/types'
import ParcelImageViewer, { type IndexType } from '@/components/ParcelImageViewer'
import {
  Sun, Cloud, CloudSun, CloudRain, CloudSnow, CloudLightning, CloudDrizzle, CloudFog,
  type LucideIcon,
} from 'lucide-react'
import {
  fetchWeather, parcelCentroid, weatherCodeLabel,
  type WeatherData,
} from '@/lib/weather'

interface Selection {
  item: SentinelItem
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
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Météo locale</p>
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
          <p className="text-xs text-gray-500 leading-tight">{weatherCodeLabel(data.current.weatherCode)}</p>
          <p className="text-sm font-semibold text-gray-800">{today.tempMin}° / {today.tempMax}°</p>
          <p className="text-xs text-gray-400">Ressenti {data.current.apparentTemp}°</p>
          <p className="text-xs text-gray-400">{today.precipMm} mm · {data.current.humidity}% hum.</p>
        </div>
      </div>
      <div className="flex gap-1">
        {([-2, -1, 0, 1, 2] as const).map(offset => {
          const day = data.days[data.todayIndex + offset]
          if (!day) return null
          const isToday = offset === 0
          return (
            <div
              key={day.date}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg ${
                isToday ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
              }`}
            >
              <span className={`text-[10px] font-medium ${isToday ? 'text-green-700' : 'text-gray-400'}`}>
                {dayLabel(day.date, today.date)}
              </span>
              <WeatherIcon code={day.weatherCode} size={16} />
              <span className="text-[10px] font-semibold text-gray-700">{day.tempMax}°</span>
              <span className="text-[10px] text-gray-400">{day.tempMin}°</span>
              <span className="text-[10px] text-blue-400">{day.precipMm} mm</span>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-gray-300 text-right mt-2">Open-Meteo</p>
    </WeatherCard>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-gray-400 text-xs">{label}</span>
      <span className="text-gray-700 text-xs font-medium text-right">{value}</span>
    </div>
  )
}

function pct(n: number | null): string {
  return n !== null ? `${Math.round(n * 10) / 10} %` : '—'
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setEmail(session.user.email ?? '')
      const uid = session.user.id
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
        if (lastWeatherParcelId.current === parcelId) setCurrentWeather(data)
      })
      .catch(() => {
        if (lastWeatherParcelId.current === parcelId) setCurrentWeather('error')
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

  async function deleteParcel(id: string) {
    if (!window.confirm('Supprimer cette parcelle ?')) return
    const { error } = await supabase.from('parcels').delete().eq('id', id)
    if (error) { alert('Erreur lors de la suppression. Réessayez.'); return }
    setParcels(prev => prev.filter(p => p.id !== id))
    if (selection?.parcel.id === id) setSelection(null)
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
    <div className="h-screen flex items-center justify-center text-gray-400">Chargement…</div>
  )

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <header className="bg-white shadow-sm px-4 md:px-6 py-3 flex items-center justify-between flex-shrink-0">
        <span className="font-bold text-green-700 text-lg">iParcel</span>
        <div className="flex items-center gap-3 md:gap-4 text-sm">
          <span className="text-gray-400 hidden sm:inline">{email}</span>
          <button onClick={handleLogout} className="text-red-500 hover:underline">
            Se déconnecter
          </button>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="text-xs text-gray-400 hover:underline hidden sm:inline">
              Supprimer mon compte
            </button>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600 font-medium">Supprimer définitivement ?</span>
                <button onClick={handleDeleteAccount} className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700">
                  Confirmer
                </button>
                <button onClick={() => { setConfirmDelete(false); setAccountError('') }} className="text-xs border px-2 py-1 rounded hover:bg-gray-50">
                  Annuler
                </button>
              </div>
              {accountError && <p className="text-xs text-red-500">{accountError}</p>}
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside className={`bg-white border-r border-gray-200 flex flex-col overflow-hidden w-full md:w-80 md:flex-shrink-0 ${selection ? 'hidden md:flex' : 'flex'}`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h1 className="text-sm font-semibold text-gray-800">Mes parcelles</h1>
            <Link href="/map" className="px-3 py-2 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700">
              + Ajouter
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {fetchError ? (
              <p className="text-red-500 text-sm">{fetchError}</p>
            ) : parcels.length === 0 ? (
              <p className="text-gray-400 text-xs mt-4 text-center">
                Aucune parcelle. Cliquez sur &ldquo;+ Ajouter&rdquo; pour dessiner votre première parcelle.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {parcels.map(parcel => (
                  <li key={parcel.id} className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-800 truncate">{parcel.name}</span>
                      <button
                        onClick={() => deleteParcel(parcel.id)}
                        className="text-xs text-red-400 hover:text-red-600 flex-shrink-0 ml-2 py-1 px-1"
                      >
                        Supprimer
                      </button>
                    </div>
                    <p className="text-gray-400 text-xs mb-2">Images disponibles</p>
                    {dates[parcel.id] === undefined ? (
                      <span className="text-gray-400 text-xs">Chargement…</span>
                    ) : dates[parcel.id].length === 0 ? (
                      <span className="text-gray-400 text-xs">Aucune image disponible</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {dates[parcel.id].map(item => {
                          const active = selection?.item.date === item.date && selection?.parcel.id === parcel.id
                          return (
                            <button
                              key={item.date}
                              onClick={() => setSelection({ item, parcel })}
                              className={`inline-flex items-center gap-1 px-3 py-2 rounded text-xs font-medium border transition-colors ${
                                active
                                  ? 'bg-green-600 border-green-600 text-white'
                                  : 'bg-white border-green-200 text-green-800 hover:bg-green-50'
                              }`}
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
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <main className={`flex-1 flex flex-col ${!selection ? 'hidden md:flex md:overflow-hidden' : 'overflow-y-auto md:overflow-hidden'}`}>
          {!selection ? (
            <div className="h-full flex items-center justify-center text-gray-300 text-sm">
              Cliquez sur une date pour afficher l&apos;image
            </div>
          ) : (
            <>
              <button
                onClick={() => setSelection(null)}
                className="md:hidden flex items-center gap-1 px-4 py-3 text-sm text-gray-600 bg-white border-b border-gray-100 flex-shrink-0"
              >
                ← Mes parcelles
              </button>

              <div className="px-4 md:px-6 pt-4 md:pt-6 pb-3 flex-shrink-0 flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-0">
                <div>
                  <h2 className="text-base font-semibold text-gray-800">{selection.parcel.name}</h2>
                  <p className="text-sm text-gray-400">{formatDate(selection.item.date)}</p>
                </div>
                <div className="flex gap-1">
                  {(['RGB', 'NDVI', 'NDWI', 'NDMI'] as const).map(idx => (
                    <button
                      key={idx}
                      onClick={() => setSelectedIndex(idx)}
                      className={`flex-1 md:flex-initial px-3 py-2 text-xs font-medium rounded border transition-colors ${
                        selectedIndex === idx
                          ? 'bg-green-600 border-green-600 text-white'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {idx}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-4 md:gap-6 px-4 md:px-6 pb-6 md:flex-1 md:min-h-0 md:overflow-hidden">
                <div className="w-full aspect-square md:aspect-auto md:flex-1 md:min-h-0 md:min-w-0">
                  <ParcelImageViewer item={selection.item} parcelGeometry={selection.parcel.geometry} index={selectedIndex} />
                </div>

                <div className="md:w-56 md:flex-shrink-0 flex flex-col gap-3 md:self-start">
                  <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Métadonnées</p>
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
                  {currentWeather === 'loading' && (
                    <WeatherCard>
                      <p className="text-xs text-gray-400">Chargement…</p>
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
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      <footer className="flex-shrink-0 border-t border-gray-100 bg-white px-6 py-2 flex gap-4 justify-center">
        <Link href="/mentions-legales" className="text-xs text-gray-400 hover:underline">Mentions légales</Link>
        <Link href="/confidentialite" className="text-xs text-gray-400 hover:underline">Confidentialité</Link>
        <Link href="/cgu" className="text-xs text-gray-400 hover:underline">CGU</Link>
      </footer>
    </div>
  )
}
