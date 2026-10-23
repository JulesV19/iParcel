'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Cloud, Loader2, Sun } from 'lucide-react'
import type { SentinelItem } from '@/lib/stac'

// 5,5 tuiles visibles : la tuile coupée au bord montre qu'il y a d'autres dates
const VISIBLE_TILES = 5.5
const GAP_PX = 6
const FADE_PX = 28

/** Frise des acquisitions Sentinel-2, de la plus ancienne à la plus récente. */
export default function DateStrip({ items, activeDate, loading, onPick }: {
  items: SentinelItem[]
  activeDate: string | null
  /** L'image de la date active est en cours de chargement */
  loading: boolean
  onPick: (item: SentinelItem) => void
}) {
  const ordered = [...items].reverse()
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  const syncEdges = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const left = el.scrollLeft > 1
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setEdges(prev => prev.left === left && prev.right === right ? prev : { left, right })
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(syncEdges)
    ro.observe(el)
    return () => ro.disconnect()
  }, [syncEdges])

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [activeDate])

  function scrollByPage(dir: -1 | 1) {
    const el = scrollRef.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: 'smooth' })
  }

  // Glisser à la souris ; au doigt, le défilement natif suffit
  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType !== 'mouse' || !scrollRef.current) return
    drag.current = { x: e.clientX, left: scrollRef.current.scrollLeft, moved: false }
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    const el = scrollRef.current
    if (!d || !el) return
    const dx = e.clientX - d.x
    if (!d.moved && Math.abs(dx) > 5) {
      d.moved = true
      el.setPointerCapture(e.pointerId)
    }
    if (d.moved) el.scrollLeft = d.left - dx
  }
  function onPointerUp() {
    // Laisse passer le clic qui suit, puis oublie le glissement
    setTimeout(() => { drag.current = null })
  }
  function onClickCapture(e: React.MouseEvent) {
    if (drag.current?.moved) { e.preventDefault(); e.stopPropagation() }
  }

  const fade = `linear-gradient(to right, ${edges.left ? 'transparent' : '#000'} 0, #000 ${FADE_PX}px, #000 calc(100% - ${FADE_PX}px), ${edges.right ? 'transparent' : '#000'} 100%)`

  return (
    <div className="relative -mx-5">
      <div
        ref={scrollRef}
        onScroll={syncEdges}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
        className="grid grid-flow-col overflow-x-auto overscroll-x-contain px-5 py-0.5 no-scrollbar md:cursor-grab md:active:cursor-grabbing"
        style={{
          gap: GAP_PX,
          gridAutoColumns: `calc((100% - ${Math.ceil(VISIBLE_TILES) - 1} * ${GAP_PX}px) / ${VISIBLE_TILES})`,
          maskImage: fade,
          WebkitMaskImage: fade,
        }}
        role="listbox"
        aria-label="Dates d'acquisition"
      >
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
              draggable={false}
              title={`${d.toLocaleDateString('fr-FR', { dateStyle: 'full' })}${cloud !== null ? ` · ${Math.round(cloud)} % de nuages sur la scène` : ''}`}
              className={`flex select-none flex-col items-center rounded-xl pt-2 pb-2.5 transition-colors ${
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

      {/* Flèches sur ordinateur, là où il reste des dates à voir */}
      {edges.left && (
        <button
          onClick={() => scrollByPage(-1)}
          aria-label="Dates plus anciennes"
          className="absolute left-1.5 top-1/2 hidden h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-paper text-ink shadow-[var(--shadow-float)] ring-1 ring-line hover:bg-paper-2 md:grid"
        >
          <ChevronLeft size={17} aria-hidden />
        </button>
      )}
      {edges.right && (
        <button
          onClick={() => scrollByPage(1)}
          aria-label="Dates plus récentes"
          className="absolute right-1.5 top-1/2 hidden h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-paper text-ink shadow-[var(--shadow-float)] ring-1 ring-line hover:bg-paper-2 md:grid"
        >
          <ChevronRight size={17} aria-hidden />
        </button>
      )}
    </div>
  )
}
