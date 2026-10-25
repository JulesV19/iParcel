'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Wordmark } from '@/components/Brand'

const MIN_PASSWORD = 8

/**
 * Arrivée depuis le lien de l'email « mot de passe oublié » : Supabase ouvre une session à partir
 * de l'adresse (detectSessionInUrl), qui permet de définir le nouveau mot de passe.
 * Une session déjà ouverte le permet aussi : c'est ce qu'autorise l'API Auth, page ou non.
 */
export default function ReinitialiserPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [linkError, setLinkError] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // getSession attend que Supabase ait lu le jeton présent dans l'adresse
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
      else setLinkError(true)
    })
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (!error) {
      router.replace('/')
      return
    }
    console.error('Auth Supabase :', error.code, error.status, error.message)
    setBusy(false)
    switch (error.code) {
      case 'same_password': setError('Choisissez un mot de passe différent de l’ancien.'); break
      case 'weak_password': setError(`Mot de passe trop faible : ${MIN_PASSWORD} caractères minimum, évitez les mots de passe courants.`); break
      case 'session_not_found':
      case 'session_expired': setLinkError(true); break
      default: setError(error.status ? `Changement impossible (${error.message}).` : 'Serveur injoignable. Vérifiez votre connexion internet.')
    }
  }

  return (
    <main className="min-h-full bg-ground px-4 pt-[max(24px,env(safe-area-inset-top))] pb-[max(48px,env(safe-area-inset-bottom))] md:py-14">
      <div className="mx-auto max-w-md">
        <div className="mb-6"><Wordmark /></div>
        <div className="rounded-[24px] border border-line bg-paper p-6 shadow-[var(--shadow-float)] md:p-8">
          {linkError ? (
            <>
              <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] leading-snug text-danger">
                Ce lien a expiré ou a déjà servi. Demandez-en un nouveau depuis la page de connexion.
              </p>
              <Link href="/login" className="btn btn-primary mt-4 w-full">Retour à la connexion</Link>
            </>
          ) : !ready ? (
            <p className="flex items-center gap-2 text-sm text-ink-2">
              <Loader2 size={16} className="animate-spin" aria-hidden /> Vérification du lien…
            </p>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-3.5">
              <h1 className="text-[22px] font-bold leading-tight tracking-[-0.02em]">Nouveau mot de passe</h1>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold">Mot de passe</span>
                <span className="relative">
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    minLength={MIN_PASSWORD}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoFocus
                    className="field pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-ink-3 hover:text-ink"
                  >
                    {showPassword ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
                  </button>
                </span>
                <span className="text-xs text-ink-3">{MIN_PASSWORD} caractères minimum.</span>
              </label>
              {error && <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] leading-snug text-danger">{error}</p>}
              <button type="submit" disabled={busy || password.length < MIN_PASSWORD} className="btn btn-primary mt-1 w-full">
                {busy ? 'Un instant…' : 'Enregistrer'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
