'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Wordmark } from '@/components/Brand'
import Turnstile from '@/components/Turnstile'
import { consentPath, readAuthorizationId } from '@/lib/oauth'

// Mosaïque d'images aériennes IGN au-dessus de la Beauce (zoom 15)
const TILE_Z = 15
const TILE_X0 = 16526
const TILE_Y0 = 11345
const COLS = 8
const ROWS = 6

function FieldsBackdrop() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-[#1d2a1f]">
      <div
        className="absolute left-1/2 top-1/2 grid"
        style={{
          gridTemplateColumns: `repeat(${COLS}, 256px)`,
          marginLeft: -(COLS * 256) / 2,
          marginTop: -(ROWS * 256) / 2,
          animation: 'drift 90s ease-in-out infinite alternate',
        }}
      >
        {Array.from({ length: ROWS * COLS }, (_, i) => {
          const x = TILE_X0 + (i % COLS)
          const y = TILE_Y0 + Math.floor(i / COLS)
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={`https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX=${TILE_Z}&TILEROW=${y}&TILECOL=${x}`}
              alt=""
              width={256}
              height={256}
              className="block h-64 w-64 max-w-none"
            />
          )
        })}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-[#0c100d]/85 via-[#0c100d]/30 to-[#0c100d]/40 md:bg-gradient-to-r md:from-[#0c100d]/80 md:via-[#0c100d]/35 md:to-transparent" />
    </div>
  )
}

// Même réponse qu'un email soit déjà inscrit ou non : la page ne révèle pas qui a un compte
const SIGNUP_SENT = 'Si cette adresse n’a pas encore de compte, un email de confirmation vient de vous être envoyé. Sinon, connectez-vous.'
// Idem pour la réinitialisation du mot de passe
const RESET_SENT = 'Si un compte existe pour cette adresse, un email avec un lien pour choisir un nouveau mot de passe vient de vous être envoyé.'
const MIN_PASSWORD = 8

type Mode = 'login' | 'signup' | 'reset'

function authErrorMessage(error: { code?: string; status?: number; message: string }, mode: Mode): string {
  switch (error.code) {
    case 'invalid_credentials': return 'Email ou mot de passe incorrect.'
    case 'email_not_confirmed': return 'Adresse pas encore confirmée. Ouvrez le lien reçu par email, puis reconnectez-vous.'
    case 'captcha_failed': return 'La vérification anti-robot a échoué. Réessayez.'
    case 'weak_password': return `Mot de passe trop faible : ${MIN_PASSWORD} caractères minimum, évitez les mots de passe courants.`
    case 'over_email_send_rate_limit': return "Trop d'emails envoyés récemment. Réessayez dans une heure."
    case 'over_request_rate_limit': return 'Trop de tentatives. Patientez quelques minutes.'
    case 'signup_disabled': return 'Les inscriptions sont fermées pour le moment.'
    case 'email_address_invalid': return 'Cette adresse email est refusée. Essayez-en une autre.'
  }
  if (!error.status) return 'Serveur injoignable. Vérifiez votre connexion internet.'
  return mode === 'login' ? `Connexion impossible (${error.message}).`
    : mode === 'signup' ? `Création du compte impossible (${error.message}).`
    : `Envoi du lien impossible (${error.message}).`
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mode, setMode] = useState<Mode>('login')
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)
  const [loading, setLoading] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  // Change après chaque tentative : le widget est recréé pour fournir un nouveau jeton
  const [attempt, setAttempt] = useState(0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!captchaToken) return
    setMessage(null)
    setLoading(true)

    if (mode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reinitialiser`,
        captchaToken,
      })
      setLoading(false)
      setAttempt(a => a + 1)
      if (error) {
        console.error('Auth Supabase :', error.code, error.status, error.message)
        setMessage({ tone: 'error', text: authErrorMessage(error, mode) })
      } else {
        setMessage({ tone: 'ok', text: RESET_SENT })
        setMode('login')
      }
      return
    }

    const { data, error } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin, captchaToken } })

    setLoading(false)
    setAttempt(a => a + 1)
    // Connexion demandée par une application tierce (OAuth) : retour à l'écran de consentement
    const authorizationId = readAuthorizationId(window.location.search)
    const home = authorizationId ? consentPath(authorizationId) : '/'

    if (mode === 'signup' && (error?.code === 'user_already_exists' || error?.code === 'email_exists')) {
      setMessage({ tone: 'ok', text: SIGNUP_SENT })
      setMode('login')
    } else if (error) {
      console.error('Auth Supabase :', error.code, error.status, error.message)
      setMessage({ tone: 'error', text: authErrorMessage(error, mode) })
    } else if (mode === 'signup' && data.session) {
      router.replace(home)
    } else if (mode === 'signup') {
      // Email déjà inscrit : Supabase renvoie un utilisateur sans identité, traité comme une inscription réussie
      setMessage({ tone: 'ok', text: SIGNUP_SENT })
      setMode('login')
    } else {
      router.replace(home)
    }
  }

  return (
    <main className="relative flex min-h-full flex-col md:flex-row">
      <FieldsBackdrop />

      <section className="relative flex flex-1 flex-col justify-end px-6 pt-[max(28px,env(safe-area-inset-top))] pb-8 text-white md:justify-between md:px-14 md:py-12">
        <span className="hidden md:block">
          <Wordmark />
        </span>
        <div className="max-w-md">
          <h1 className="text-[34px] font-bold leading-[1.05] tracking-[-0.03em] md:text-[52px]">
            Vos parcelles,<br />vues du ciel.
          </h1>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/75">
            Images Sentinel-2 tous les 2 à 5 jours, indices de végétation et météo locale, parcelle par parcelle.
          </p>
        </div>
        {/* Attribution exigée par la Licence Ouverte, visible aussi sur mobile */}
        <p className="mt-4 text-[11px] text-white/50 md:mt-0">Images aériennes © IGN – Licence Ouverte</p>
      </section>

      <section className="relative flex items-center justify-center md:w-[480px] md:shrink-0 md:p-10">
        <div className="w-full rounded-t-[28px] bg-paper px-6 pt-7 pb-[max(24px,env(safe-area-inset-bottom))] text-ink shadow-panel md:max-w-sm md:rounded-[28px] md:p-8">
          <div className="md:hidden mb-6"><Wordmark /></div>

          {mode === 'reset' ? (
            <div className="mb-6">
              <h2 className="text-[17px] font-bold tracking-[-0.01em]">Mot de passe oublié</h2>
              <p className="mt-1 text-[13px] leading-snug text-ink-2">
                Indiquez l’adresse de votre compte : vous recevrez un lien pour choisir un nouveau mot de passe.
              </p>
            </div>
          ) : (
            <div role="tablist" aria-label="Accès au compte" className="mb-6 grid grid-cols-2 gap-1 rounded-[14px] bg-paper-2 p-1">
              {(['login', 'signup'] as const).map(m => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => { setMode(m); setMessage(null) }}
                  className={`h-9 rounded-[10px] text-sm font-semibold transition-all ${mode === m ? 'bg-paper text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]' : 'text-ink-2 hover:text-ink'}`}
                >
                  {m === 'login' ? 'Connexion' : 'Créer un compte'}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold">Email</span>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="vous@exemple.fr"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="field"
              />
            </label>
            {mode !== 'reset' && (
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold">Mot de passe</span>
                <span className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    minLength={mode === 'signup' ? MIN_PASSWORD : undefined}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
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
                {mode === 'signup' && <span className="text-xs text-ink-3">{MIN_PASSWORD} caractères minimum.</span>}
              </label>
            )}
            {mode === 'login' && (
              <button
                type="button"
                onClick={() => { setMode('reset'); setMessage(null) }}
                className="-mt-1 self-start text-xs text-ink-3 underline underline-offset-2 hover:text-ink"
              >
                Mot de passe oublié ?
              </button>
            )}

            {message && (
              <p
                role="status"
                className={`rounded-xl px-3.5 py-2.5 text-[13px] leading-snug ${message.tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-paper-2 text-ink'}`}
              >
                {message.text}
              </p>
            )}

            <Turnstile key={attempt} onToken={setCaptchaToken} />

            {mode === 'signup' && (
              <p className="text-xs leading-snug text-ink-3">
                En créant un compte, vous acceptez les{' '}
                <Link href="/cgu" className="underline underline-offset-2 hover:text-ink">conditions d’utilisation</Link>.
                Vos données sont traitées comme décrit dans la{' '}
                <Link href="/confidentialite" className="underline underline-offset-2 hover:text-ink">politique de confidentialité</Link>.
              </p>
            )}

            <button id="login-submit" type="submit" disabled={loading || !captchaToken} className="btn btn-primary mt-1 w-full">
              {loading ? 'Un instant…' : !captchaToken ? 'Vérification anti-robot…' : mode === 'login' ? 'Se connecter' : mode === 'signup' ? 'Créer mon compte' : 'Recevoir le lien'}
            </button>
            {mode === 'reset' && (
              <button type="button" onClick={() => { setMode('login'); setMessage(null) }} className="btn btn-quiet w-full">
                Retour à la connexion
              </button>
            )}
          </form>

          <nav className="mt-6 flex justify-center gap-4 text-[11px] text-ink-3">
            <Link href="/mentions-legales" className="hover:text-ink">Mentions légales</Link>
            <Link href="/confidentialite" className="hover:text-ink">Confidentialité</Link>
            <Link href="/cgu" className="hover:text-ink">CGU</Link>
          </nav>
        </div>
      </section>
    </main>
  )
}
