'use client'

import { AlertTriangle } from 'lucide-react'
import { INDEX_INFO, HIST_BINS, colorAt, gradientCss, type IndexType, type ParcelStats } from '@/lib/render'
import { formatIndex } from '@/lib/geo'

export type RenderStatus =
  | { status: 'loading'; pct: number; label: string }
  | { status: 'error'; message: string }
  | { status: 'done'; stats: ParcelStats | null }

const INDEXES: IndexType[] = ['RGB', 'NDVI', 'NDWI', 'NDMI']

export function IndexSwitch({ value, onChange }: { value: IndexType; onChange: (v: IndexType) => void }) {
  return (
    <div role="radiogroup" aria-label="Type d'image" className="grid grid-cols-4 gap-1 rounded-[14px] bg-paper-3/70 p-1">
      {INDEXES.map(idx => {
        const active = idx === value
        return (
          <button
            key={idx}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(idx)}
            className={`h-9 rounded-[10px] text-[13px] font-semibold transition-all ${
              active ? 'bg-paper text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {INDEX_INFO[idx].label}
          </button>
        )
      })}
    </div>
  )
}

function Scale({ index, stats }: { index: IndexType; stats: ParcelStats | null }) {
  const info = INDEX_INFO[index]
  if (!info.stops) return null
  const stops = info.stops
  const peak = stats ? Math.max(1, ...stats.histogram) : 1
  return (
    <div className="flex flex-col gap-1.5">
      {stats && (
        <div className="flex h-12 items-end gap-px" aria-hidden>
          {stats.histogram.map((n, i) => {
            const center = (i + 0.5) / HIST_BINS * 2 - 1
            const [r, g, b] = colorAt(center, stops)
            return (
              <span
                key={i}
                className="flex-1 rounded-t-[2px]"
                style={{ height: n ? `${Math.max(4, (n / peak) * 100)}%` : 0, background: `rgb(${r},${g},${b})` }}
              />
            )
          })}
        </div>
      )}
      <div className="relative">
        <div className="h-2.5 rounded-full ring-1 ring-inset ring-black/5" style={{ background: gradientCss(stops) }} />
        {stats && (
          <span
            className="absolute -top-1 h-[18px] w-[3px] -translate-x-1/2 rounded-full bg-ink ring-2 ring-paper"
            style={{ left: `${((stats.mean + 1) / 2) * 100}%` }}
            aria-hidden
          />
        )}
      </div>
      <div className="relative h-4 text-[10px] text-ink-3 tabular-nums font-mono">
        {info.ticks.map(t => {
          const pos = (t.v + 1) / 2 * 100
          return (
            <span
              key={t.v}
              className="absolute top-0"
              style={pos === 0 ? { left: 0 } : pos === 100 ? { right: 0 } : { left: `${pos}%`, transform: 'translateX(-50%)' }}
            >
              {t.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function AnalysisCard({ index, render, opacity, onOpacity }: {
  index: IndexType
  render: RenderStatus | null
  opacity: number
  onOpacity: (v: number) => void
}) {
  const info = INDEX_INFO[index]
  const stats = render?.status === 'done' ? render.stats : null

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold">{info.name}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{info.description}</p>
        </div>
      </div>

      {render?.status === 'loading' && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <div className="h-1.5 overflow-hidden rounded-full bg-paper-3">
            <div className="h-full rounded-full bg-signal transition-[width] duration-300 ease-out" style={{ width: `${render.pct}%` }} />
          </div>
          <span className="text-xs text-ink-3">{render.label}</span>
        </div>
      )}

      {render?.status === 'error' && (
        <p className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          <AlertTriangle size={16} className="mt-px shrink-0" aria-hidden />
          {render.message}
        </p>
      )}

      {stats && info.stops && (
        <div className="animate-rise">
          <p className="eyebrow">{index} moyen</p>
          <p className="font-mono text-[34px] font-medium leading-none tracking-tight tabular-nums mt-1">{formatIndex(stats.mean)}</p>
        </div>
      )}

      <Scale index={index} stats={stats} />

      {render?.status === 'done' && (
        <label className="flex items-center gap-3 text-xs text-ink-2">
          <span className="shrink-0">Opacité</span>
          <input
            id="overlay-opacity"
            type="range"
            min={0}
            max={100}
            value={Math.round(opacity * 100)}
            onChange={e => onOpacity(Number(e.target.value) / 100)}
            className="h-1 flex-1 accent-[var(--color-signal-strong)]"
          />
          <span className="w-9 text-right tabular-nums">{Math.round(opacity * 100)} %</span>
        </label>
      )}

      {stats && (
        <p className="text-[11px] leading-snug text-ink-3">
          Nuages et ombres ne sont pas masqués : vérifiez l&apos;image en couleurs avant d&apos;interpréter.
        </p>
      )}
    </section>
  )
}
