'use client'

import { useEffect, useRef } from 'react'
import { Cloud, Loader2, Sun } from 'lucide-react'
import type { SentinelItem } from '@/lib/stac'

/** Frise des acquisitions Sentinel-2, de la plus ancienne à la plus récente. */
export default function DateStrip({ items, activeDate, loading, onPick }: {
  items: SentinelItem[]
  activeDate: string | null
  /** L'image de la date active est en cours de chargement */
  loading: boolean
  onPick: (item: SentinelItem) => void
}) {
  const ordered = [...items].reverse()
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [activeDate])

  return (
    <div className="-mx-5 overflow-x-auto no-scrollbar" role="listbox" aria-label="Dates d'acquisition">
      <div className="flex gap-1.5 px-5 py-0.5 w-max">
        {ordered.map(item => {
          const d = new Date(item.date)
          const active = item.date === activeDate
          const cloud = item.cloudCover
          const clear = cloud !== null && cloud <= 30
          return (
            <button
              key={item.date}
              ref={active ? activeRef : undefined}
              role="option"
              aria-selected={active}
              aria-busy={active && loading}
              onClick={() => onPick(item)}
              title={`${d.toLocaleDateString('fr-FR', { dateStyle: 'full' })}${cloud !== null ? ` · ${Math.round(cloud)} % de nuages sur la scène` : ''}`}
              className={`group flex w-[54px] shrink-0 flex-col items-center rounded-xl pt-2 pb-2.5 transition-colors ${
                active ? 'bg-ink text-paper' : 'bg-paper-2 text-ink hover:bg-paper-3'
              }`}
            >
              <span className={`text-[10px] font-medium uppercase tracking-wider ${active ? 'text-paper/70' : 'text-ink-3'}`}>
                {d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}
              </span>
              <span className="text-[19px] font-semibold leading-tight tabular-nums">{d.getDate()}</span>
              <span
                className={`mt-0.5 inline-flex items-center gap-0.5 text-[10px] tabular-nums ${active ? 'text-paper/75' : clear ? 'text-ink-2' : 'text-ink-3'}`}
                aria-label={cloud !== null ? `${Math.round(cloud)} % de nuages` : 'Nébulosité inconnue'}
              >
                {active && loading
                  ? <Loader2 size={10} strokeWidth={2.5} className="animate-spin" aria-hidden />
                  : clear ? <Sun size={10} strokeWidth={2.25} aria-hidden /> : <Cloud size={10} strokeWidth={2.25} aria-hidden />}
                {cloud !== null ? `${Math.round(cloud)}%` : '—'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
