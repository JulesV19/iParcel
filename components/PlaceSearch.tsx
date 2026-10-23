'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { MapPin, Search, X } from 'lucide-react'

interface Place {
  label: string
  context: string
  type: string
  lat: number
  lon: number
}

const GEOCODER = 'https://data.geopf.fr/geocodage/search'

/** Recherche de commune ou d'adresse (Géoplateforme IGN, France). */
export default function PlaceSearch({ onPick }: { onPick: (lat: number, lon: number, zoom: number) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [failed, setFailed] = useState(false)
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) return
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      fetch(`${GEOCODER}?${new URLSearchParams({ q, limit: '5', autocomplete: '1' })}`, { signal: ctrl.signal })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
        .then(json => {
          const places: Place[] = (json.features ?? []).map((f: {
            geometry: { coordinates: [number, number] }
            properties: { label: string; context?: string; type: string }
          }) => ({
            label: f.properties.label,
            context: f.properties.context ?? '',
            type: f.properties.type,
            lon: f.geometry.coordinates[0],
            lat: f.geometry.coordinates[1],
          }))
          setResults(places)
          setActive(0)
          setFailed(false)
        })
        .catch(e => { if ((e as Error).name !== 'AbortError') setFailed(true) })
    }, 220)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [query])

  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])

  function pick(p: Place) {
    onPick(p.lat, p.lon, p.type === 'municipality' ? 14 : p.type === 'street' ? 16 : 17)
    setQuery(p.label)
    setOpen(false)
    ;(document.activeElement as HTMLElement | null)?.blur()
  }

  const showList = open && query.trim().length >= 3 && (results.length > 0 || failed)

  return (
    <div ref={rootRef} className="relative">
      <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
      <input
        id="place-search"
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Aller à une commune, une adresse…"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (!showList || results.length === 0) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % results.length) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + results.length) % results.length) }
          if (e.key === 'Enter') { e.preventDefault(); pick(results[active]) }
          if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
        }}
        className="field pl-10 pr-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {query && (
        <button
          onClick={() => { setQuery(''); setResults([]) }}
          aria-label="Effacer la recherche"
          className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-ink-3 hover:bg-paper-3 hover:text-ink"
        >
          <X size={15} aria-hidden />
        </button>
      )}

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-2xl border border-line bg-paper py-1.5 shadow-panel animate-rise"
        >
          {failed ? (
            <li className="px-4 py-3 text-sm text-ink-3">Recherche indisponible pour le moment.</li>
          ) : results.map((p, i) => (
            <li key={`${p.label}-${i}`} role="option" aria-selected={i === active}>
              <button
                onPointerEnter={() => setActive(i)}
                onClick={() => pick(p)}
                className={`flex w-full items-start gap-3 px-4 py-2.5 text-left ${i === active ? 'bg-paper-2' : ''}`}
              >
                <MapPin size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{p.label}</span>
                  <span className="block truncate text-xs text-ink-3">{p.context}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
