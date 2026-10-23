'use client'

import { useEffect } from 'react'
import { Wordmark } from '@/components/Brand'

/** Plantage inattendu d'une page : écran de secours au lieu d'une page blanche. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Erreur de rendu :', error)
  }, [error])

  return (
    <main className="grid min-h-full place-items-center bg-ground px-4">
      <div className="w-full max-w-sm rounded-[24px] border border-line bg-paper p-6 shadow-[var(--shadow-float)]">
        <Wordmark />
        <h1 className="mt-6 text-[22px] font-bold leading-tight tracking-[-0.02em]">Un problème est survenu</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          La page n’a pas pu s’afficher. Vos parcelles ne sont pas perdues : réessayez, ou rechargez la page.
        </p>
        <div className="mt-6 flex gap-2">
          <button onClick={reset} className="btn btn-primary flex-1">Réessayer</button>
          <button onClick={() => window.location.reload()} className="btn btn-quiet flex-1">Recharger</button>
        </div>
      </div>
    </main>
  )
}
