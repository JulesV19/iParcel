import { shapePath } from '@/lib/geo'

/** Marque : une parcelle relevée, sommets compris. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="9" fill="#151d17" />
      <path d="M8 11.5 19.5 7.5 24.5 19 13 24.5Z" fill="#f5d04a" fillOpacity=".22" stroke="#f5d04a" strokeWidth="2" strokeLinejoin="round" />
      {[[8, 11.5], [19.5, 7.5], [24.5, 19], [13, 24.5]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.1" fill="#f5d04a" />
      ))}
    </svg>
  )
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <Logo />
      <span className="text-[17px] font-bold tracking-[-0.02em]">iParcel</span>
    </span>
  )
}

/** Vignette de la forme réelle d'une parcelle. */
export function ParcelShape({ geometry, size = 44, className = '' }: { geometry: GeoJSON.Polygon; size?: number; className?: string }) {
  return (
    <span
      className={`grid place-items-center shrink-0 rounded-xl bg-paper-2 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <path
          d={shapePath(geometry, size, size * 0.18)}
          fill="var(--color-signal)"
          fillOpacity=".55"
          stroke="var(--color-ink)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}
