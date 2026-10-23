'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

export type SheetSnap = 'peek' | 'full'

const DESKTOP_QUERY = '(min-width: 768px)'

export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    cb => {
      const mq = window.matchMedia(DESKTOP_QUERY)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  )
}

/**
 * Panneau flottant à gauche sur ordinateur, feuille glissante en bas sur mobile.
 * Signale la place qu'il occupe pour que la carte cadre la zone restée visible.
 */
export default function Sheet({ header, footer, children, snap, onSnap, onInsets, panelKey }: {
  header: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
  snap: SheetSnap
  onSnap: (s: SheetSnap) => void
  onInsets: (insets: { left: number; bottom: number }) => void
  /** Change à chaque changement de vue : remonte le contenu en haut et rejoue son entrée. */
  panelKey: string
}) {
  const isDesktop = useIsDesktop()
  const ref = useRef<HTMLElement>(null)
  const drag = useRef<{ y: number; dy: number } | null>(null)
  const [dragY, setDragY] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const report = () => {
      const r = el.getBoundingClientRect()
      onInsets(window.matchMedia(DESKTOP_QUERY).matches
        ? { left: r.right, bottom: 0 }
        : { left: 0, bottom: window.innerHeight - r.top })
    }
    const ro = new ResizeObserver(report)
    ro.observe(el)
    window.addEventListener('resize', report)
    report()
    return () => { ro.disconnect(); window.removeEventListener('resize', report) }
  }, [onInsets, isDesktop])

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { y: e.clientY, dy: 0 }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return
    const dy = e.clientY - drag.current.y
    drag.current.dy = dy
    // Résistance élastique au-delà de 80 px
    setDragY(Math.sign(dy) * Math.min(Math.abs(dy), 80 + Math.sqrt(Math.max(0, Math.abs(dy) - 80)) * 4))
  }
  function onPointerUp() {
    const d = drag.current
    drag.current = null
    setDragY(0)
    if (!d) return
    if (Math.abs(d.dy) < 6) onSnap(snap === 'full' ? 'peek' : 'full')
    else if (d.dy < -40) onSnap('full')
    else if (d.dy > 40) onSnap('peek')
  }

  return (
    <section
      ref={ref}
      aria-label="Panneau iParcel"
      className="fixed inset-x-0 bottom-0 z-[600] flex flex-col rounded-t-[24px] border-t border-line bg-paper/95 text-ink shadow-panel backdrop-blur-xl
        md:inset-x-auto md:bottom-auto md:left-4 md:top-4 md:w-[392px] md:rounded-[22px] md:border"
      style={{
        maxHeight: isDesktop ? 'calc(100dvh - 32px)' : snap === 'full' ? 'calc(92dvh - env(safe-area-inset-top))' : '46dvh',
        transform: dragY ? `translateY(${Math.max(dragY, -40)}px)` : undefined,
        transition: dragY ? 'none' : 'max-height .38s var(--ease-soft), transform .3s var(--ease-soft)',
      }}
    >
      <div
        className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center md:hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="button"
        aria-label={snap === 'full' ? 'Réduire le panneau' : 'Agrandir le panneau'}
      >
        <span className="h-1.5 w-10 rounded-full bg-ink-3/40" />
      </div>
      <div className="shrink-0">{header}</div>
      <div
        key={panelKey}
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain quiet-scroll animate-rise ${footer ? '' : 'pb-[env(safe-area-inset-bottom)]'}`}
      >
        {children}
      </div>
      {footer && (
        <div className="shrink-0 border-t border-line px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:pb-4">
          {footer}
        </div>
      )}
    </section>
  )
}
