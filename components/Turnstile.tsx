'use client'

import { useEffect, useRef, useState } from 'react'

// Clé publique du widget Cloudflare Turnstile ; la clé secrète est uniquement dans Supabase
const SITE_KEY = '0x4AAAAAAFiTfElpF9Yvao-x'
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string
  remove(widgetId: string): void
}

declare global {
  interface Window { turnstile?: TurnstileApi }
}

let scriptPromise: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT_SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => { scriptPromise = null; reject(new Error('Turnstile indisponible')) }
    document.head.appendChild(s)
  })
  return scriptPromise
}

/**
 * Vérification anti-robot exigée par Supabase à la connexion et à l'inscription.
 * Un jeton ne sert qu'une fois : le parent remonte le composant (prop key) après chaque tentative.
 */
export default function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const onTokenRef = useRef(onToken)
  const [failed, setFailed] = useState(false)

  useEffect(() => { onTokenRef.current = onToken })

  useEffect(() => {
    let widgetId: string | null = null
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return
        widgetId = window.turnstile.render(ref.current, {
          sitekey: SITE_KEY,
          theme: 'auto',
          language: 'fr',
          size: 'flexible',
          callback: (token: string) => { setFailed(false); onTokenRef.current(token) },
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => { setFailed(true); onTokenRef.current(null) },
        })
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => {
      cancelled = true
      if (widgetId) window.turnstile?.remove(widgetId)
      onTokenRef.current(null)
    }
  }, [])

  return (
    <div className="flex flex-col gap-1.5">
      <div ref={ref} className="min-h-[65px]" />
      {failed && (
        <p className="text-xs text-danger">
          Vérification anti-robot indisponible. Désactivez un éventuel bloqueur de contenu, puis rechargez la page.
        </p>
      )}
    </div>
  )
}
