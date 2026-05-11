'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })

    setLoading(false)

    if (error) {
      setError(mode === 'login'
        ? 'Email ou mot de passe incorrect.'
        : 'Impossible de créer le compte. Cet email est peut-être déjà utilisé.')
    } else if (mode === 'signup') {
      setError('Compte créé ! Vérifiez votre email puis connectez-vous.')
    } else {
      router.push('/')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      {/* Ambient glow blobs */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div
          style={{
            position: 'absolute', top: '15%', left: '25%',
            width: 500, height: 500,
            background: 'radial-gradient(circle, rgba(22,163,74,0.08) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
        <div
          style={{
            position: 'absolute', bottom: '20%', right: '20%',
            width: 400, height: 400,
            background: 'radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
      </div>

      <div
        className="glass-strong rounded-2xl w-full max-w-sm p-8 relative"
        style={{ borderRadius: 20 }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <h1
            className="text-3xl font-bold tracking-tight mb-1"
            style={{ color: 'var(--accent)' }}
          >
            iParcel
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Gestion de parcelles agricoles
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            id="login-email"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="input-glass rounded-xl px-4 py-3 text-sm w-full"
          />
          <input
            id="login-password"
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="input-glass rounded-xl px-4 py-3 text-sm w-full"
          />

          {error && (
            <p
              className="text-sm rounded-xl px-3 py-2"
              style={{
                color: error.startsWith('Compte créé')
                  ? 'var(--accent)'
                  : '#f87171',
                background: error.startsWith('Compte créé')
                  ? 'rgba(0,230,118,0.08)'
                  : 'rgba(248,113,113,0.08)',
                border: `1px solid ${error.startsWith('Compte créé') ? 'rgba(0,230,118,0.2)' : 'rgba(248,113,113,0.2)'}`,
              }}
            >
              {error}
            </p>
          )}

          <button
            id="login-submit"
            type="submit"
            disabled={loading}
            className="btn-accent rounded-xl py-3 text-sm font-semibold mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '…' : mode === 'login' ? 'Se connecter' : 'Créer un compte'}
          </button>
        </form>

        <p className="text-sm text-center mt-5" style={{ color: 'var(--text-muted)' }}>
          {mode === 'login' ? 'Pas encore de compte ?' : 'Déjà un compte ?'}{' '}
          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
            className="font-medium transition-colors hover:opacity-80"
            style={{ color: 'var(--accent)' }}
          >
            {mode === 'login' ? 'Créer un compte' : 'Se connecter'}
          </button>
        </p>
      </div>
    </div>
  )
}
