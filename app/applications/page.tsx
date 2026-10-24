'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import type { OAuthGrant } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import LegalPage from '@/components/LegalPage'

type AuditRow = {
  id: number
  created_at: string
  client_id: string
  tool: string
  parcel_id: string | null
  status: 'pending' | 'ok' | 'error' | 'rate_limited'
}

const TOOL_LABELS: Record<string, string> = {
  list_parcels: 'Liste des parcelles',
  get_parcel: 'Fiche de parcelle',
  get_weather: 'Météo',
  list_satellite_images: 'Dates d’images satellite',
  get_vegetation_index: 'Indice de végétation',
}

const STATUS_LABELS: Record<AuditRow['status'], string> = {
  ok: 'Réussi',
  error: 'Échec',
  rate_limited: 'Bloqué : limite atteinte',
  pending: 'Non terminé',
}

const ACTIVITY_LIMIT = 50

const dateLong = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })
const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

export default function ApplicationsPage() {
  const router = useRouter()
  const [grants, setGrants] = useState<OAuthGrant[] | null>(null)
  const [activity, setActivity] = useState<AuditRow[]>([])
  // Noms gardés après un retrait d'accès, pour l'historique
  const [clientNames, setClientNames] = useState<Map<string, string>>(new Map())
  const [parcelNames, setParcelNames] = useState<Map<string, string>>(new Map())
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      const [grantsRes, auditRes, parcelsRes] = await Promise.all([
        supabase.auth.oauth.listGrants(),
        supabase.from('mcp_audit').select('id, created_at, client_id, tool, parcel_id, status')
          .order('id', { ascending: false }).limit(ACTIVITY_LIMIT),
        supabase.from('parcels').select('id, name'),
      ])
      if (grantsRes.error || auditRes.error || parcelsRes.error) {
        setError('Impossible de charger vos applications connectées. Vérifiez votre connexion puis rechargez la page.')
        return
      }
      setGrants(grantsRes.data)
      setClientNames(new Map(grantsRes.data.map(g => [g.client.id, g.client.name])))
      setActivity(auditRes.data as AuditRow[])
      setParcelNames(new Map(parcelsRes.data.map(p => [p.id as string, p.name as string])))
    })
  }, [router])

  async function revoke(clientId: string) {
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.oauth.revokeGrant({ clientId })
    setBusy(false)
    if (error) {
      console.error('OAuth Supabase :', error.code, error.status, error.message)
      setError('Le retrait de l’accès a échoué. Réessayez.')
      return
    }
    setConfirming(null)
    setGrants(prev => prev?.filter(g => g.client.id !== clientId) ?? null)
  }

  return (
    <LegalPage title="Applications connectées">
      {error && <p role="alert" className="mb-6 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] leading-snug text-danger">{error}</p>}

      {!grants ? (
        !error && (
          <p className="flex items-center gap-2 text-sm text-ink-2">
            <Loader2 size={16} className="animate-spin" aria-hidden /> Chargement…
          </p>
        )
      ) : (
        <>
          <section className="mb-8">
            <p className="text-sm text-ink-2">
              Ces applications, des assistants IA par exemple, peuvent lire vos parcelles, leurs images
              satellite, leurs indices et leur météo. Elles ne peuvent rien modifier. Retirer l’accès
              le coupe immédiatement ; l’application devra vous redemander l’autorisation.
            </p>

            {grants.length === 0 ? (
              <p className="mt-4 rounded-xl bg-paper-2 px-3.5 py-2.5 text-sm text-ink-2">
                Aucune application n’a accès à votre compte. <Link href="/connecter">Connecter une IA</Link>
              </p>
            ) : (
              <ul className="mt-4 flex flex-col divide-y divide-line rounded-2xl border border-line">
                {grants.map(g => (
                  <li key={g.client.id} className="flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{g.client.name}</p>
                        <p className="mt-0.5 text-xs text-ink-3">Autorisée le {dateLong.format(new Date(g.granted_at))}</p>
                      </div>
                      {confirming !== g.client.id && (
                        <button type="button" onClick={() => setConfirming(g.client.id)} className="btn btn-quiet h-9 shrink-0 text-sm">
                          Retirer l’accès
                        </button>
                      )}
                    </div>
                    {confirming === g.client.id && (
                      <div className="flex flex-col gap-3 rounded-xl bg-paper-2 p-3">
                        <p className="text-[13px] leading-snug text-ink-2">
                          {g.client.name} ne pourra plus lire vos données. Les données déjà transmises restent chez cette application.
                        </p>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setConfirming(null)} disabled={busy} className="btn btn-quiet h-9 flex-1 bg-paper text-sm">Annuler</button>
                          <button type="button" onClick={() => revoke(g.client.id)} disabled={busy} className="btn btn-danger h-9 flex-1 text-sm">
                            {busy ? 'Retrait…' : 'Retirer'}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-ink">Activité récente</h2>
            <p className="text-sm text-ink-2">
              Les {ACTIVITY_LIMIT} dernières lectures faites par vos applications connectées. L’historique est conservé un an.
            </p>
            {activity.length === 0 ? (
              <p className="mt-4 rounded-xl bg-paper-2 px-3.5 py-2.5 text-sm text-ink-2">Aucune activité pour l’instant.</p>
            ) : (
              <ul className="mt-4 flex flex-col divide-y divide-line text-[13px]">
                {activity.map(a => (
                  <li key={a.id} className="flex items-baseline justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate">
                        <span className="font-medium">{TOOL_LABELS[a.tool] ?? a.tool}</span>
                        {a.parcel_id && <span className="text-ink-2"> · {parcelNames.get(a.parcel_id) ?? 'Parcelle inconnue'}</span>}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-ink-3">
                        {clientNames.get(a.client_id) ?? 'Application déconnectée'} · {dateTime.format(new Date(a.created_at))}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs ${a.status === 'ok' ? 'text-ink-3' : 'text-danger'}`}>{STATUS_LABELS[a.status]}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </LegalPage>
  )
}
