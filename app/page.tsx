'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  ArrowLeft, Check, ChevronRight, CloudSun, Leaf, Loader2, LocateFixed, Minus, Pencil, Plus, Satellite, Trash2, Undo2, X, ZoomIn,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchSentinelDates, formatDate, formatShortDate, pickDefaultItem, type SentinelItem } from '@/lib/stac'
import { fetchWeather, parcelCentroid, type WeatherData } from '@/lib/weather'
import { formatArea, formatCoords, formatTotalArea, parcelAreaHa, ringAreaHa } from '@/lib/geo'
import { renderParcel, gradientCss, INDEX_INFO, type IndexType, type RenderResult } from '@/lib/render'
import type { Parcel } from '@/lib/types'
import type { MapApi, MapInsets } from '@/components/ParcelMap'
import Sheet, { useIsDesktop, type SheetSnap } from '@/components/Sheet'
import { ParcelShape, Wordmark } from '@/components/Brand'
import { WeatherIcon, WeatherPanel } from '@/components/Weather'
import DateStrip from '@/components/DateStrip'
import { AnalysisCard, IndexSwitch, type RenderStatus } from '@/components/Analysis'
import PlaceSearch from '@/components/PlaceSearch'
import AccountMenu from '@/components/AccountMenu'

const ParcelMap = dynamic(() => import('@/components/ParcelMap'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-ground" />,
})

type Mode =
  | { kind: 'browse' }
  | { kind: 'parcel'; id: string }
  | { kind: 'draw' }
  | { kind: 'name'; geometry: GeoJSON.Polygon }

type Toast = { id: number; text: string; tone: 'ok' | 'error' }

// En dessous, un clic couvre plusieurs dizaines de mètres : tracé imprécis
const DRAW_MIN_ZOOM = 14
const LARGE_PARCEL_HA = 300

const byName = (a: Parcel, b: Parcel) => a.name.localeCompare(b.name, 'fr', { numeric: true })

// Requêtes simultanées vers les API externes au chargement de la liste
const PREFETCH_CONCURRENCY = 4

function isPolygonParcel(p: { geometry: unknown }): boolean {
  const g = p.geometry as { type?: string; coordinates?: unknown } | null
  if (!g || typeof g !== 'object' || g.type !== 'Polygon' || !Array.isArray(g.coordinates)) return false
  const ring = g.coordinates[0]
  return Array.isArray(ring) && ring.length >= 4 && ring.every(c =>
    Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-[13px]">
      <dt className="text-ink-3">{label}</dt>
      <dd className="font-medium tabular-nums text-right">{value}</dd>
    </div>
  )
}

function pct(n: number | null): string {
  return n !== null ? `${(Math.round(n * 10) / 10).toLocaleString('fr-FR')} %` : '—'
}

export default function Home() {
  const router = useRouter()
  const isDesktop = useIsDesktop()

  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [parcels, setParcels] = useState<Parcel[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [dates, setDates] = useState<Record<string, SentinelItem[] | 'error'>>({})
  const [weather, setWeather] = useState<Record<string, WeatherData | 'error'>>({})

  const [mode, setMode] = useState<Mode>({ kind: 'browse' })
  const [hovered, setHovered] = useState<string | null>(null)
  const [snap, setSnap] = useState<SheetSnap>('peek')
  const [insets, setInsets] = useState<MapInsets>({ left: 0, bottom: 0 })
  const [zoom, setZoom] = useState(6)
  const [toast, setToast] = useState<Toast | null>(null)

  // Vue parcelle
  const [activeDate, setActiveDate] = useState<string | null>(null)
  const [index, setIndex] = useState<IndexType>('RGB')
  const [opacity, setOpacity] = useState(0.92)
  const [results, setResults] = useState<Record<string, RenderResult>>({})
  const [renderErrors, setRenderErrors] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState<{ key: string; pct: number; label: string } | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Dessin
  const [vertices, setVertices] = useState<[number, number][]>([])
  const [draftName, setDraftName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const mapApi = useRef<MapApi | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const fetchedIds = useRef(new Set<string>())
  const initialFocusDone = useRef(false)

  const selected = mode.kind === 'parcel' ? parcels.find(p => p.id === mode.id) ?? null : null
  const selectedDates = selected ? dates[selected.id] : undefined
  const items = useMemo(() => Array.isArray(selectedDates) ? selectedDates : [], [selectedDates])
  const item = items.find(i => i.date === activeDate) ?? pickDefaultItem(items)
  const renderKey = selected && item ? `${selected.id}|${item.date}|${index}` : null
  const totalHa = useMemo(() => parcels.reduce((s, p) => s + parcelAreaHa(p.geometry), 0), [parcels])

  const notify = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    setToast({ id: Date.now(), text, tone })
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  // ─── Session et parcelles ──────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      setEmail(session.user.email ?? '')
      setUserId(session.user.id)
      supabase
        .from('parcels')
        .select('id, name, geometry')
        .eq('user_id', session.user.id)
        .then(({ data, error }) => {
          if (error) {
            setFetchError('Impossible de charger vos parcelles. Vérifiez votre connexion puis rechargez la page.')
          } else {
            const list = (data ?? []).filter(isPolygonParcel).map(p => p as Parcel).sort(byName)
            setParcels(list)
            // Parcelle ouverte lors de la visite précédente (adresse ?p=…)
            const fromUrl = new URLSearchParams(window.location.search).get('p')
            if (list.some(p => p.id === fromUrl)) setMode({ kind: 'parcel', id: fromUrl! })
          }
          setLoading(false)
        })
    })
  }, [router])

  // Session expirée ou fermée dans un autre onglet : retour à la connexion
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') router.replace('/login')
    })
    return () => subscription.unsubscribe()
  }, [router])

  // Images Sentinel et météo de chaque parcelle, chargées en avance pour la liste
  useEffect(() => {
    const queue = parcels.filter(p => !fetchedIds.current.has(p.id))
    queue.forEach(p => fetchedIds.current.add(p.id))
    let next = 0
    async function worker() {
      while (next < queue.length) {
        const parcel = queue[next++]
        const [lat, lon] = parcelCentroid(parcel.geometry)
        await Promise.all([
          fetchSentinelDates(parcel.geometry)
            .then(d => setDates(prev => ({ ...prev, [parcel.id]: d })))
            .catch(() => setDates(prev => ({ ...prev, [parcel.id]: 'error' }))),
          fetchWeather(lat, lon)
            .then(w => setWeather(prev => ({ ...prev, [parcel.id]: w })))
            .catch(() => setWeather(prev => ({ ...prev, [parcel.id]: 'error' }))),
        ])
      }
    }
    for (let i = 0; i < PREFETCH_CONCURRENCY; i++) worker()
  }, [parcels])

  // Premier cadrage : la parcelle ouverte, sinon toutes les parcelles
  useEffect(() => {
    if (!mapReady || loading || initialFocusDone.current || !mapApi.current) return
    initialFocusDone.current = true
    if (selected) mapApi.current.focusParcel(selected.geometry)
    else mapApi.current.focusAll(parcels.map(p => p.geometry))
  }, [mapReady, loading, parcels, selected])

  // La parcelle ouverte reste dans l'adresse (rechargement, favori)
  useEffect(() => {
    if (!initialFocusDone.current) return
    const url = mode.kind === 'parcel' ? `/?p=${mode.id}` : '/'
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, '', url)
  }, [mode])

  // ─── Rendu de l'image sur la parcelle ──────────────────────
  useEffect(() => {
    if (!renderKey || !selected || !item || results[renderKey] || renderErrors[renderKey]) return
    let cancelled = false
    const key = renderKey
    renderParcel(item, selected.geometry, index, (p, label) => {
      if (!cancelled) setProgress({ key, pct: p, label })
    }, () => cancelled)
      .then(result => {
        if (cancelled || !result) return
        setResults(prev => ({ ...prev, [key]: result }))
      })
      .catch(e => {
        if (cancelled) return
        console.error('Rendu Sentinel :', e)
        // Les erreurs prévues sont rédigées en français ; les autres (réseau, GeoTIFF) restent génériques
        const message = e instanceof Error && e.name === 'TimeoutError' ? "Le serveur d'images met trop de temps à répondre. Réessayez plus tard."
          : e instanceof Error && /[àéèêç]/.test(e.message) ? e.message
          : "Impossible de charger l'image pour cette date."
        setRenderErrors(prev => ({ ...prev, [key]: message }))
      })
    return () => { cancelled = true }
  }, [renderKey, selected, item, index, results, renderErrors])

  const renderStatus: RenderStatus | null = !renderKey ? null
    : results[renderKey] ? { status: 'done', stats: results[renderKey].stats }
    : renderErrors[renderKey] ? { status: 'error', message: renderErrors[renderKey] }
    : {
        status: 'loading',
        pct: progress?.key === renderKey ? progress.pct : 4,
        label: progress?.key === renderKey ? progress.label : 'Préparation…',
      }

  // Seule l'image de la date et de l'indice choisis est posée : pendant le chargement, la parcelle reste vide
  const shownResult = renderKey ? results[renderKey] ?? null : null
  const isRendering = renderStatus?.status === 'loading'

  const overlay = useMemo(
    () => shownResult ? { url: shownResult.url, bounds: shownResult.bounds, opacity } : null,
    [shownResult, opacity],
  )

  // ─── Navigation ────────────────────────────────────────────
  const openParcel = useCallback((parcel: Parcel) => {
    setMode({ kind: 'parcel', id: parcel.id })
    setActiveDate(null)
    setRenaming(false)
    setConfirmDelete(false)
    setSnap('peek')
    mapApi.current?.focusParcel(parcel.geometry)
  }, [])

  const backToList = useCallback(() => {
    setMode({ kind: 'browse' })
    setRenaming(false)
    setConfirmDelete(false)
  }, [])

  function startDraw() {
    setMode({ kind: 'draw' })
    setVertices([])
    setSnap('peek')
    mapApi.current?.startDraw()
  }

  const cancelDraw = useCallback(() => {
    mapApi.current?.cancelDraw()
    setMode({ kind: 'browse' })
    setVertices([])
    setDraftName('')
    setSaveError('')
  }, [])

  const stepDate = useCallback((dir: -1 | 1) => {
    if (!item) return
    const i = items.findIndex(x => x.date === item.date)
    // items va du plus récent au plus ancien : « suivant » = plus récent
    const next = items[i - dir]
    if (next) setActiveDate(next.date)
  }, [item, items])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, [contenteditable]')) return
      if (e.key === 'Escape') {
        if (mode.kind === 'parcel') backToList()
        else if (mode.kind === 'name') cancelDraw()
      }
      if (mode.kind === 'parcel' && e.key === 'ArrowLeft') stepDate(-1)
      if (mode.kind === 'parcel' && e.key === 'ArrowRight') stepDate(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode.kind, backToList, cancelDraw, stepDate])

  // ─── Actions ───────────────────────────────────────────────
  async function saveDraft(e?: React.FormEvent) {
    e?.preventDefault()
    if (mode.kind !== 'name' || !userId || !draftName.trim()) return
    setSaving(true)
    setSaveError('')
    const { data, error } = await supabase
      .from('parcels')
      .insert({ name: draftName.trim(), geometry: mode.geometry, user_id: userId })
      .select('id, name, geometry')
      .single()
    setSaving(false)
    if (error?.code === 'P0001') {
      // Limite levée par le trigger parcels_limit (supabase/limites-parcels.sql)
      setSaveError(error.message)
      return
    }
    if (error || !data) {
      setSaveError("L'enregistrement a échoué. Vérifiez votre connexion et réessayez.")
      return
    }
    const parcel = data as Parcel
    setParcels(prev => [...prev, parcel].sort(byName))
    setDraftName('')
    setVertices([])
    notify(`« ${parcel.name} » enregistrée`)
    openParcel(parcel)
  }

  async function renameParcel() {
    if (!selected) return
    const name = renameValue.trim()
    if (!name || name === selected.name) { setRenaming(false); return }
    const { error } = await supabase.from('parcels').update({ name }).eq('id', selected.id)
    if (error) { notify('Le renommage a échoué. Réessayez.', 'error'); return }
    setParcels(prev => prev.map(p => p.id === selected.id ? { ...p, name } : p).sort(byName))
    setRenaming(false)
    notify('Parcelle renommée')
  }

  async function deleteParcel() {
    if (!selected) return
    const { error } = await supabase.from('parcels').delete().eq('id', selected.id)
    if (error) { notify('La suppression a échoué. Réessayez.', 'error'); return }
    setParcels(prev => prev.filter(p => p.id !== selected.id))
    notify(`« ${selected.name} » supprimée`)
    backToList()
  }

  async function logout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  async function deleteAccount(): Promise<string | null> {
    const { error } = await supabase.rpc('delete_user')
    if (error) return 'La suppression du compte a échoué. Réessayez.'
    await supabase.auth.signOut()
    router.replace('/login')
    return null
  }

  async function locate() {
    try {
      await mapApi.current?.locate()
    } catch {
      notify('Position indisponible. Autorisez la localisation dans votre navigateur.', 'error')
    }
  }

  // ─── Carte ─────────────────────────────────────────────────
  const onMapReady = useCallback((api: MapApi) => {
    mapApi.current = api
    setMapReady(true)
  }, [])

  const onMapSelect = useCallback((id: string) => {
    if (mode.kind === 'draw' || mode.kind === 'name') return
    const parcel = parcels.find(p => p.id === id)
    if (parcel) openParcel(parcel)
  }, [mode.kind, parcels, openParcel])

  const onDrawComplete = useCallback((geometry: GeoJSON.Polygon) => {
    setMode({ kind: 'name', geometry })
    setSnap('peek')
  }, [])

  const onDrawCancel = useCallback(() => {
    setMode(m => m.kind === 'draw' ? { kind: 'browse' } : m)
    setVertices([])
  }, [])

  const onInsets = useCallback((i: MapInsets) => {
    setInsets(prev => prev.left === i.left && prev.bottom === i.bottom ? prev : i)
  }, [])

  const draftArea = vertices.length >= 3 ? ringAreaHa([...vertices, vertices[0]]) : 0

  // ─── Panneau ───────────────────────────────────────────────
  let header: React.ReactNode
  let body: React.ReactNode
  let footer: React.ReactNode = null

  if (mode.kind === 'browse') {
    header = (
      <div className="flex flex-col gap-3 px-5 pt-1 pb-3 md:pt-4">
        <div className="flex items-center justify-between">
          <Wordmark />
          <AccountMenu email={email} parcelCount={parcels.length} onLogout={logout} onDeleteAccount={deleteAccount} />
        </div>
        <PlaceSearch onPick={(lat, lon, zoom) => { mapApi.current?.flyTo(lat, lon, zoom); setSnap('peek') }} />
      </div>
    )

    if (loading) {
      body = (
        <div className="flex flex-col gap-2 px-5 pb-5" aria-busy="true" aria-label="Chargement des parcelles">
          <div className="skeleton mb-2 h-3 w-32" />
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-3 py-2">
              <div className="skeleton h-11 w-11 rounded-xl" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="skeleton h-3.5 w-2/3" />
                <div className="skeleton h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )
    } else if (fetchError) {
      body = <p className="mx-5 mb-5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{fetchError}</p>
    } else if (parcels.length === 0) {
      body = (
        <div className="flex flex-col gap-5 px-5 pt-2 pb-6">
          <div>
            <h1 className="text-[22px] font-bold leading-tight tracking-[-0.02em]">Dessinez votre première parcelle</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">
              Trouvez votre champ sur la carte, puis placez ses sommets. iParcel s&apos;occupe du reste.
            </p>
          </div>
          <ul className="flex flex-col gap-3.5">
            {[
              { Icon: Satellite, title: 'Images Sentinel-2', text: 'Les 12 derniers passages du satellite, tous les 2 à 5 jours.' },
              { Icon: Leaf, title: 'Indices de végétation', text: 'Vigueur, humidité et eau libre, posées directement sur la parcelle.' },
              { Icon: CloudSun, title: 'Météo locale', text: 'Conditions actuelles, pluie des 2 derniers jours et prévisions.' },
            ].map(({ Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-paper-2 text-ink-2"><Icon size={18} aria-hidden /></span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-[13px] leading-snug text-ink-2">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )
    } else {
      body = (
        <div className="px-3 pb-3">
          <p className="px-2 pb-1.5 text-xs font-medium text-ink-3">
            {parcels.length} parcelle{parcels.length > 1 ? 's' : ''} · <span className="tabular-nums">{formatTotalArea(totalHa)}</span>
          </p>
          <ul className="flex flex-col">
            {parcels.map(parcel => {
              const d = dates[parcel.id]
              const w = weather[parcel.id]
              const today = w && w !== 'error' ? w.days[w.todayIndex] : null
              return (
                <li key={parcel.id}>
                  <button
                    onClick={() => openParcel(parcel)}
                    onPointerEnter={() => setHovered(parcel.id)}
                    onPointerLeave={() => setHovered(null)}
                    onFocus={() => setHovered(parcel.id)}
                    onBlur={() => setHovered(null)}
                    className={`group flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors ${hovered === parcel.id ? 'bg-paper-2' : ''}`}
                  >
                    <ParcelShape geometry={parcel.geometry} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{parcel.name}</span>
                      <span className="block truncate text-xs text-ink-3">
                        <span className="tabular-nums">{formatArea(parcelAreaHa(parcel.geometry))}</span>
                        {' · '}
                        {d === undefined ? 'Recherche d’images…'
                          : d === 'error' ? 'Images indisponibles'
                          : d.length === 0 ? 'Aucune image récente'
                          : `Dernière image ${formatShortDate(d[0].date)}`}
                      </span>
                    </span>
                    {today && (
                      <span className="flex shrink-0 items-center gap-1 text-[13px] font-medium tabular-nums text-ink-2">
                        <WeatherIcon code={today.weatherCode} size={16} />
                        {today.tempMax}°
                      </span>
                    )}
                    <ChevronRight size={16} className="shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )
    }

    if (!loading && !fetchError) {
      footer = (
        <button onClick={startDraw} className="btn btn-primary w-full">
          <Plus size={18} strokeWidth={2.5} aria-hidden />
          Nouvelle parcelle
        </button>
      )
    }
  } else if (mode.kind === 'parcel' && selected) {
    const w = weather[selected.id]
    header = (
      <div className="flex items-center justify-between px-3 pt-0.5 pb-1 md:pt-3">
        <button onClick={backToList} className="flex h-9 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-ink-2 hover:bg-paper-2 hover:text-ink">
          <ArrowLeft size={17} aria-hidden />
          Parcelles
        </button>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => { setRenaming(true); setRenameValue(selected.name); setConfirmDelete(false) }}
            className="icon-btn"
            aria-label="Renommer la parcelle"
            title="Renommer"
          >
            <Pencil size={17} aria-hidden />
          </button>
          <button
            onClick={() => { setConfirmDelete(true); setRenaming(false) }}
            className="icon-btn hover:!text-danger"
            aria-label="Supprimer la parcelle"
            title="Supprimer"
          >
            <Trash2 size={17} aria-hidden />
          </button>
        </div>
      </div>
    )

    body = (
      <div className="flex flex-col gap-5 px-5 pt-1 pb-5">
        <div className="flex items-center gap-3.5">
          <ParcelShape geometry={selected.geometry} size={52} />
          <div className="min-w-0 flex-1">
            {renaming ? (
              <form onSubmit={e => { e.preventDefault(); renameParcel() }} className="flex items-center gap-1.5">
                <input
                  id="rename-parcel"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setRenaming(false) } }}
                  autoFocus
                  maxLength={80}
                  aria-label="Nouveau nom"
                  className="field h-10 text-[17px] font-semibold"
                />
                <button type="submit" disabled={!renameValue.trim()} className="icon-btn shrink-0 bg-signal !text-on-signal hover:bg-signal-strong" aria-label="Valider le nom">
                  <Check size={18} aria-hidden />
                </button>
                <button type="button" onClick={() => setRenaming(false)} className="icon-btn shrink-0" aria-label="Annuler">
                  <X size={18} aria-hidden />
                </button>
              </form>
            ) : (
              <h1 className="truncate text-[22px] font-bold leading-tight tracking-[-0.02em]">{selected.name}</h1>
            )}
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[13px] text-ink-2">
              <span className="font-semibold tabular-nums text-ink">{formatArea(parcelAreaHa(selected.geometry))}</span>
              <span className="font-mono text-[11px] text-ink-3 whitespace-pre">{formatCoords(parcelCentroid(selected.geometry))}</span>
            </p>
          </div>
        </div>

        {confirmDelete && (
          <div className="flex flex-col gap-3 rounded-2xl bg-danger-soft p-4 animate-rise">
            <p className="text-sm text-ink">
              Supprimer « {selected.name} » ? La parcelle et son tracé seront effacés définitivement.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="btn btn-quiet h-10 flex-1 text-sm">Annuler</button>
              <button onClick={deleteParcel} className="btn btn-danger h-10 flex-1 text-sm">Supprimer</button>
            </div>
          </div>
        )}

        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="eyebrow">Images Sentinel-2</h2>
            {item && <span className="text-xs font-medium text-ink-2">{formatDate(item.date)}</span>}
          </div>
          {selectedDates === undefined ? (
            <div className="flex gap-1.5" aria-label="Recherche des images">
              {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton h-[62px] w-[54px] shrink-0 rounded-xl" />)}
            </div>
          ) : selectedDates === 'error' ? (
            <p className="rounded-xl bg-paper-2 px-3 py-2.5 text-[13px] text-ink-2">Le catalogue Sentinel-2 ne répond pas. Réessayez dans quelques minutes.</p>
          ) : items.length === 0 ? (
            <p className="rounded-xl bg-paper-2 px-3 py-2.5 text-[13px] text-ink-2">Aucune image Sentinel-2 récente pour cette parcelle.</p>
          ) : (
            <DateStrip items={items} activeDate={item?.date ?? null} loading={isRendering} onPick={i => setActiveDate(i.date)} />
          )}
          {/* Mention exigée par la licence Copernicus pour les images traitées */}
          {item && <p className="text-[11px] text-ink-3">Contient des données Copernicus Sentinel modifiées ({new Date(item.date).getFullYear()})</p>}
        </section>

        {items.length > 0 && (
          <>
            <IndexSwitch value={index} onChange={setIndex} />
            <AnalysisCard index={index} render={renderStatus} opacity={opacity} onOpacity={setOpacity} />
          </>
        )}

        {w === undefined ? (
          <div className="flex flex-col gap-3" aria-label="Chargement de la météo">
            <div className="skeleton h-3 w-36" />
            <div className="skeleton h-12 w-full" />
            <div className="skeleton h-28 w-full" />
          </div>
        ) : w === 'error' ? (
          <p className="text-[13px] text-ink-3">Météo indisponible pour le moment.</p>
        ) : (
          <WeatherPanel data={w} />
        )}

        {item && (
          <details className="group rounded-2xl border border-line px-4">
            <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              Détails de l&apos;acquisition
              <ChevronRight size={16} className="text-ink-3 transition-transform group-open:rotate-90" aria-hidden />
            </summary>
            <dl className="divide-y divide-line border-t border-line pb-1">
              {item.platform && <MetaRow label="Satellite" value={item.platform.replace(/^sentinel-/i, 'Sentinel-').toUpperCase()} />}
              <MetaRow label="Heure de passage" value={new Date(item.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} />
              {item.sunElevation !== null && <MetaRow label="Élévation du soleil" value={`${Math.round(item.sunElevation)}°`} />}
              <MetaRow label="Nuages sur la scène" value={pct(item.cloudCover)} />
              <MetaRow label="Ombres de nuages" value={pct(item.cloudShadow)} />
              <MetaRow label="Végétation" value={pct(item.vegetation)} />
              <MetaRow label="Eau" value={pct(item.water)} />
              <MetaRow label="Neige, glace" value={pct(item.snow)} />
              <MetaRow label="Pixels sans donnée" value={pct(item.nodata)} />
            </dl>
          </details>
        )}
      </div>
    )
  } else if (mode.kind === 'draw') {
    const step = vertices.length < 3 ? 0 : 1
    header = (
      <div className="flex items-center justify-between px-5 pt-0.5 pb-2 md:pt-4">
        <h1 className="text-[17px] font-bold tracking-[-0.01em]">Nouvelle parcelle</h1>
        <button onClick={cancelDraw} className="icon-btn" aria-label="Abandonner le dessin"><X size={18} aria-hidden /></button>
      </div>
    )
    body = (
      <div className="flex flex-col gap-4 px-5 pb-4">
        <ol className="flex flex-col gap-2.5">
          {[
            { title: 'Placez les sommets', text: isDesktop ? 'Cliquez sur la carte à chaque angle du champ.' : 'Touchez la carte à chaque angle du champ.' },
            { title: 'Fermez la forme', text: isDesktop ? 'Cliquez sur le premier sommet ou sur Terminer.' : 'Touchez le premier sommet ou Terminer.' },
            { title: 'Nommez la parcelle', text: 'Elle apparaît ensuite dans votre liste.' },
          ].map((s, i) => (
            <li key={s.title} className={`flex gap-3 transition-opacity ${i === step ? '' : 'opacity-45'}`}>
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${i < step ? 'bg-ink text-paper' : i === step ? 'bg-signal text-on-signal' : 'bg-paper-3 text-ink-2'}`}>
                {i < step ? <Check size={13} strokeWidth={3} aria-hidden /> : i + 1}
              </span>
              <span className="pt-0.5">
                <span className="block text-sm font-semibold">{s.title}</span>
                {i === step && <span className="block text-[13px] leading-snug text-ink-2">{s.text}</span>}
              </span>
            </li>
          ))}
        </ol>

        {zoom < DRAW_MIN_ZOOM && (
          <p className="flex items-start gap-2.5 rounded-xl bg-signal/25 px-3 py-2.5 text-[13px] leading-snug text-ink">
            <ZoomIn size={16} className="mt-px shrink-0" aria-hidden />
            Vous êtes loin du sol. Cherchez votre commune ci-dessous ou zoomez sur le champ avant de placer les sommets.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-paper-2 px-3 py-2">
            <p className="eyebrow">Sommets</p>
            <p className="font-mono text-lg font-medium tabular-nums">{vertices.length}</p>
          </div>
          <div className="rounded-xl bg-paper-2 px-3 py-2">
            <p className="eyebrow">Surface</p>
            <p className="font-mono text-lg font-medium tabular-nums">{draftArea ? formatArea(draftArea) : '—'}</p>
          </div>
        </div>

        <PlaceSearch onPick={(lat, lon, zoom) => mapApi.current?.flyTo(lat, lon, Math.max(zoom, 16))} />
        <p className="text-xs leading-snug text-ink-3">Zoomez au plus près des limites du champ pour un tracé précis.</p>
      </div>
    )
    footer = (
      <div className="flex gap-2">
        <button onClick={() => mapApi.current?.undoVertex()} disabled={vertices.length === 0} className="btn btn-quiet flex-1">
          <Undo2 size={17} aria-hidden />
          Dernier point
        </button>
        <button onClick={() => mapApi.current?.finishDraw()} disabled={vertices.length < 3} className="btn btn-primary flex-1">
          <Check size={18} strokeWidth={2.5} aria-hidden />
          Terminer
        </button>
      </div>
    )
  } else if (mode.kind === 'name') {
    header = (
      <div className="flex items-center justify-between px-5 pt-0.5 pb-2 md:pt-4">
        <h1 className="text-[17px] font-bold tracking-[-0.01em]">Nouvelle parcelle</h1>
        <button onClick={cancelDraw} className="icon-btn" aria-label="Abandonner"><X size={18} aria-hidden /></button>
      </div>
    )
    body = (
      <form id="name-form" onSubmit={saveDraft} className="flex flex-col gap-4 px-5 pb-4">
        <div className="flex items-center gap-3.5">
          <ParcelShape geometry={mode.geometry} size={56} />
          <div>
            <p className="font-mono text-xl font-medium tabular-nums">{formatArea(parcelAreaHa(mode.geometry))}</p>
            <p className="font-mono text-[11px] text-ink-3 whitespace-pre">{formatCoords(parcelCentroid(mode.geometry))}</p>
          </div>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Nom de la parcelle</span>
          <input
            id="new-parcel-name"
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); cancelDraw() } }}
            placeholder="Ex. Les Grandes Pièces"
            maxLength={80}
            autoFocus
            className="field"
          />
        </label>
        {parcelAreaHa(mode.geometry) > LARGE_PARCEL_HA && (
          <p className="rounded-xl bg-signal/25 px-3 py-2.5 text-[13px] leading-snug text-ink">
            Cette surface est inhabituelle pour une parcelle. Si le tracé est faux, annulez puis zoomez sur le champ avant de redessiner.
          </p>
        )}
        {saveError && <p className="text-[13px] text-danger">{saveError}</p>}
      </form>
    )
    footer = (
      <div className="flex gap-2">
        <button onClick={cancelDraw} className="btn btn-quiet">Annuler</button>
        <button type="submit" form="name-form" disabled={!draftName.trim() || saving} className="btn btn-primary flex-1">
          {saving ? 'Enregistrement…' : 'Enregistrer la parcelle'}
        </button>
      </div>
    )
  }

  const controlsBottom = isDesktop ? 24 : insets.bottom + 12
  const caption = selected && item && (shownResult || isRendering)
    ? `${index === 'RGB' ? 'Couleurs naturelles' : index} · ${formatShortDate(item.date)}`
    : null

  return (
    <main className="fixed inset-0 overflow-hidden bg-ground">
      <ParcelMap
        parcels={parcels}
        selectedId={selected?.id ?? null}
        loadingId={isRendering ? selected?.id ?? null : null}
        hoveredId={hovered}
        overlay={overlay}
        draft={mode.kind === 'name' ? mode.geometry : null}
        insets={insets}
        onReady={onMapReady}
        onSelect={onMapSelect}
        onZoom={setZoom}
        onHover={setHovered}
        onDrawProgress={setVertices}
        onDrawComplete={onDrawComplete}
        onDrawCancel={onDrawCancel}
      />

      {caption && (
        <div
          className="pointer-events-none fixed z-[500] flex items-center gap-2 whitespace-nowrap rounded-full bg-[rgb(12_16_13/0.62)] px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md
            left-1/2 -translate-x-1/2 top-[max(12px,env(safe-area-inset-top))] md:left-auto md:right-4 md:translate-x-0 md:top-4"
        >
          {renderStatus?.status === 'loading'
            ? <Loader2 size={13} aria-hidden className="animate-spin opacity-80" />
            : <Satellite size={13} aria-hidden className="opacity-80" />}
          {caption}
          {renderStatus?.status === 'loading'
            ? <span className="tabular-nums text-white/70">{Math.round(renderStatus.pct)} %</span>
            : INDEX_INFO[index].stops && <span className="h-1.5 w-10 rounded-full" style={{ background: gradientCss(INDEX_INFO[index].stops!) }} />}
        </div>
      )}

      <div
        className="fixed right-[max(16px,env(safe-area-inset-right))] z-[500] flex flex-col gap-2 transition-[bottom] duration-300"
        style={{ bottom: controlsBottom }}
      >
        <button onClick={locate} className="map-btn rounded-full" aria-label="Me localiser" title="Me localiser">
          <LocateFixed size={19} aria-hidden />
        </button>
        <div className="hidden flex-col overflow-hidden rounded-full shadow-[var(--shadow-float)] md:flex">
          <button onClick={() => mapApi.current?.zoomIn()} className="map-btn !shadow-none" aria-label="Zoomer" title="Zoomer"><Plus size={19} aria-hidden /></button>
          <span className="h-px bg-line" />
          <button onClick={() => mapApi.current?.zoomOut()} className="map-btn !shadow-none" aria-label="Dézoomer" title="Dézoomer"><Minus size={19} aria-hidden /></button>
        </div>
      </div>

      <Sheet
        header={header}
        footer={footer}
        snap={snap}
        onSnap={setSnap}
        onInsets={onInsets}
        panelKey={mode.kind === 'parcel' ? `parcel-${mode.id}` : mode.kind}
      >
        {body}
      </Sheet>

      {toast && (
        <div
          key={toast.id}
          role="status"
          className={`fixed left-1/2 z-[700] -translate-x-1/2 rounded-full px-4 py-2.5 text-sm font-medium shadow-[var(--shadow-float)]
            top-[max(14px,env(safe-area-inset-top))] md:top-auto md:bottom-6 ${toast.tone === 'error' ? 'bg-danger text-on-danger' : 'bg-ink text-paper'}`}
        >
          {toast.text}
        </div>
      )}
    </main>
  )
}
