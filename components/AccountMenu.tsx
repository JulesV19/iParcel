'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Download, LogOut, Plug, Trash2 } from 'lucide-react'

export default function AccountMenu({ email, parcelCount, onExport, onLogout, onDeleteAccount }: {
  email: string
  parcelCount: number
  onExport: () => void
  onLogout: () => void
  onDeleteAccount: () => Promise<string | null>
}) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); close() }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  function close() {
    setOpen(false)
    setConfirming(false)
    setError('')
  }

  async function confirmDelete() {
    setDeleting(true)
    const err = await onDeleteAccount()
    setDeleting(false)
    if (err) setError(err)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        aria-label="Mon compte"
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-full bg-paper-2 text-sm font-semibold uppercase text-ink ring-1 ring-line transition hover:bg-paper-3"
      >
        {email.charAt(0) || '·'}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-72 overflow-hidden rounded-2xl border border-line bg-paper shadow-panel animate-rise">
          <div className="px-4 pt-4 pb-3">
            <p className="eyebrow">Connecté</p>
            <p className="mt-0.5 truncate text-sm font-medium">{email}</p>
          </div>

          {!confirming ? (
            <div className="flex flex-col border-t border-line p-1.5">
              <Link href="/applications" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-paper-2">
                <Plug size={16} className="text-ink-3" aria-hidden />
                Applications connectées
              </Link>
              {parcelCount > 0 && (
                <button onClick={onExport} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-paper-2">
                  <Download size={16} className="text-ink-3" aria-hidden />
                  Exporter mes parcelles (GeoJSON)
                </button>
              )}
              <button onClick={onLogout} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-paper-2">
                <LogOut size={16} className="text-ink-3" aria-hidden />
                Se déconnecter
              </button>
              <button onClick={() => setConfirming(true)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-danger hover:bg-danger-soft">
                <Trash2 size={16} aria-hidden />
                Supprimer mon compte
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 border-t border-line p-4">
              <p className="text-sm leading-relaxed text-ink-2">
                Votre compte et {parcelCount === 0 ? 'vos données' : parcelCount === 1 ? 'votre parcelle' : `vos ${parcelCount} parcelles`} seront
                supprimés définitivement.
              </p>
              {error && <p className="text-xs text-danger">{error}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setConfirming(false); setError('') }} className="btn btn-quiet h-10 flex-1 text-sm">Annuler</button>
                <button onClick={confirmDelete} disabled={deleting} className="btn btn-danger h-10 flex-1 text-sm">
                  {deleting ? 'Suppression…' : 'Supprimer'}
                </button>
              </div>
            </div>
          )}

          <nav className="flex gap-3 border-t border-line px-4 py-3 text-[11px] text-ink-3">
            <Link href="/mentions-legales" className="hover:text-ink">Mentions légales</Link>
            <Link href="/confidentialite" className="hover:text-ink">Confidentialité</Link>
            <Link href="/cgu" className="hover:text-ink">CGU</Link>
          </nav>
        </div>
      )}
    </div>
  )
}
