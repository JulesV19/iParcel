'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, Loader2, X } from 'lucide-react'
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { readAuthorizationId } from '@/lib/oauth'
import { Wordmark } from '@/components/Brand'

// Données d'identité que Supabase transmet à l'application selon les scopes demandés
const SCOPE_LABELS: Record<string, string> = {
  email: 'Votre adresse email',
  profile: 'Votre nom et votre photo de profil',
  phone: 'Votre numéro de téléphone',
}

const CAN = [
  'Lire vos parcelles : nom, contour, surface',
  'Consulter leurs images satellite, indices de végétation et météo',
]

const CANNOT = [
  'Créer, modifier ou supprimer une parcelle',
  'Modifier ou supprimer votre compte',
]

function redirectHost(uri: string): string {
  try { return new URL(uri).host } catch { return uri }
}

export default function ConsentPage() {
  const router = useRouter()
  const [authorizationId, setAuthorizationId] = useState<string | null>(null)
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const id = readAuthorizationId(window.location.search)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!id) { setError('Lien d’autorisation invalide. Relancez la connexion depuis votre application.'); return }
      if (!session) { router.replace(`/login?authorization_id=${id}`); return }
      setAuthorizationId(id)
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id)
      if (error || !data) {
        console.error('OAuth Supabase :', error?.code, error?.status, error?.message)
        setError('Cette demande d’accès a expiré ou n’est plus valide. Relancez la connexion depuis votre application.')
      } else if ('redirect_url' in data) {
        // Accès déjà accordé à cette application : Supabase renvoie directement le code
        window.location.assign(data.redirect_url)
      } else {
        setDetails(data)
      }
    })
  }, [router])

  async function decide(approve: boolean) {
    if (!authorizationId) return
    setBusy(true)
    const { error } = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId)
      : await supabase.auth.oauth.denyAuthorization(authorizationId)
    // En cas de succès, le SDK redirige vers l'application : la page reste en attente
    if (error) {
      console.error('OAuth Supabase :', error.code, error.status, error.message)
      setError('La réponse n’a pas pu être enregistrée. Relancez la connexion depuis votre application.')
      setBusy(false)
    }
  }

  async function switchAccount() {
    if (!authorizationId) return
    setBusy(true)
    await supabase.auth.signOut()
    router.replace(`/login?authorization_id=${authorizationId}`)
  }

  const identity = details ? details.scope.split(' ').filter(s => s in SCOPE_LABELS) : []

  return (
    <main className="min-h-full bg-ground px-4 pt-[max(24px,env(safe-area-inset-top))] pb-[max(48px,env(safe-area-inset-bottom))] md:py-14">
      <div className="mx-auto max-w-md">
        <div className="mb-6"><Wordmark /></div>
        <div className="rounded-[24px] border border-line bg-paper p-6 shadow-[var(--shadow-float)] md:p-8">
          {error ? (
            <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] leading-snug text-danger">{error}</p>
          ) : !details ? (
            <p className="flex items-center gap-2 text-sm text-ink-2">
              <Loader2 size={16} className="animate-spin" aria-hidden /> Chargement de la demande…
            </p>
          ) : (
            <>
              <h1 className="text-[22px] font-bold leading-tight tracking-[-0.02em]">
                {details.client.name} souhaite accéder à votre compte iParcel
              </h1>
              <p className="mt-2 text-[13px] leading-snug text-ink-2">
                Compte <span className="font-semibold text-ink">{details.user.email}</span>
                {' · '}
                <button type="button" onClick={switchAccount} disabled={busy} className="underline underline-offset-2 hover:text-ink">
                  Changer de compte
                </button>
              </p>

              <h2 className="mt-6 text-[13px] font-semibold">Cette application pourra</h2>
              <ul className="mt-2 flex flex-col gap-1.5 text-[13px] leading-snug">
                {[...CAN, ...identity.map(s => SCOPE_LABELS[s])].map(t => (
                  <li key={t} className="flex gap-2"><Check size={16} className="mt-px shrink-0 text-ink-2" aria-hidden />{t}</li>
                ))}
              </ul>

              <h2 className="mt-5 text-[13px] font-semibold">Elle ne pourra pas</h2>
              <ul className="mt-2 flex flex-col gap-1.5 text-[13px] leading-snug">
                {CANNOT.map(t => (
                  <li key={t} className="flex gap-2"><X size={16} className="mt-px shrink-0 text-ink-3" aria-hidden />{t}</li>
                ))}
              </ul>

              <p className="mt-5 rounded-xl bg-paper-2 px-3.5 py-2.5 text-xs leading-snug text-ink-2">
                Après autorisation, vous serez renvoyé vers <span className="font-semibold text-ink">{redirectHost(details.redirect_uri)}</span>.
                Les données lues sont transmises à cette application, qui les traite selon ses propres conditions.
                Vous pouvez retirer cet accès à tout moment. Voir la{' '}
                <Link href="/confidentialite" className="underline underline-offset-2 hover:text-ink">politique de confidentialité</Link>.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => decide(false)} disabled={busy} className="btn btn-quiet">Refuser</button>
                <button type="button" onClick={() => decide(true)} disabled={busy} className="btn btn-primary">
                  {busy ? 'Un instant…' : 'Autoriser'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
