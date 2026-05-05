'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { fetchSentinelDates, formatDate } from '@/lib/stac'
import type { SentinelItem } from '@/lib/stac'
import type { Parcel } from '@/lib/types'
import ParcelImageViewer from '@/components/ParcelImageViewer'

interface Selection {
  item: SentinelItem
  parcel: Parcel
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-gray-400 text-xs">{label}</span>
      <span className="text-gray-700 text-xs font-medium text-right">{value}</span>
    </div>
  )
}

function pct(n: number | null): string {
  return n !== null ? `${Math.round(n * 10) / 10} %` : '—'
}

export default function Home() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [parcels, setParcels] = useState<Parcel[]>([])
  const [dates, setDates] = useState<Record<string, SentinelItem[]>>({})
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [selection, setSelection] = useState<Selection | null>(null)
  const fetchedIds = useRef(new Set<string>())

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setEmail(session.user.email ?? '')
      const uid = session.user.id
      supabase
        .from('parcels')
        .select('id, name, geometry')
        .eq('user_id', uid)
        .then(({ data, error }) => {
          if (error) {
            setFetchError('Impossible de charger vos parcelles. Vérifiez votre connexion.')
            setLoading(false)
            return
          }
          const valid = (data ?? []).filter(p =>
            p.geometry &&
            typeof p.geometry === 'object' &&
            (p.geometry as { type?: string }).type === 'Polygon'
          )
          setParcels(valid as Parcel[])
          setLoading(false)
        })
    })
  }, [router])

  useEffect(() => {
    parcels.forEach(parcel => {
      if (fetchedIds.current.has(parcel.id)) return
      fetchedIds.current.add(parcel.id)
      fetchSentinelDates(parcel.geometry)
        .then(d => setDates(prev => ({ ...prev, [parcel.id]: d })))
        .catch(() => setDates(prev => ({ ...prev, [parcel.id]: [] })))
    })
  }, [parcels])

  async function deleteParcel(id: string) {
    if (!window.confirm('Supprimer cette parcelle ?')) return
    const { error } = await supabase.from('parcels').delete().eq('id', id)
    if (error) { alert('Erreur lors de la suppression. Réessayez.'); return }
    setParcels(prev => prev.filter(p => p.id !== id))
    if (selection?.parcel.id === id) setSelection(null)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function handleDeleteAccount() {
    const { error } = await supabase.rpc('delete_user')
    if (error) {
      setAccountError('Erreur lors de la suppression du compte. Réessayez.')
      return
    }
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return (
    <div className="h-screen flex items-center justify-center text-gray-400">Chargement…</div>
  )

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white shadow-sm px-6 py-3 flex items-center justify-between flex-shrink-0">
        <span className="font-bold text-green-700 text-lg">iParcel</span>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-400 hidden sm:inline">{email}</span>
          <button onClick={handleLogout} className="text-red-500 hover:underline">
            Se déconnecter
          </button>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="text-xs text-gray-400 hover:underline">
              Supprimer mon compte
            </button>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600 font-medium">Supprimer définitivement ?</span>
                <button onClick={handleDeleteAccount} className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700">
                  Confirmer
                </button>
                <button onClick={() => { setConfirmDelete(false); setAccountError('') }} className="text-xs border px-2 py-1 rounded hover:bg-gray-50">
                  Annuler
                </button>
              </div>
              {accountError && <p className="text-xs text-red-500">{accountError}</p>}
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Panneau gauche — liste des parcelles */}
        <aside className="w-80 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h1 className="text-sm font-semibold text-gray-800">Mes parcelles</h1>
            <Link href="/map" className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700">
              + Ajouter
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {fetchError ? (
              <p className="text-red-500 text-sm">{fetchError}</p>
            ) : parcels.length === 0 ? (
              <p className="text-gray-400 text-xs mt-4 text-center">
                Aucune parcelle. Cliquez sur &ldquo;+ Ajouter&rdquo; pour dessiner votre première parcelle.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {parcels.map(parcel => (
                  <li key={parcel.id} className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-800 truncate">{parcel.name}</span>
                      <button
                        onClick={() => deleteParcel(parcel.id)}
                        className="text-xs text-red-400 hover:text-red-600 flex-shrink-0 ml-2"
                      >
                        Supprimer
                      </button>
                    </div>
                    <p className="text-gray-400 text-xs mb-1.5">Images disponibles</p>
                    {dates[parcel.id] === undefined ? (
                      <span className="text-gray-400 text-xs">Chargement…</span>
                    ) : dates[parcel.id].length === 0 ? (
                      <span className="text-gray-400 text-xs">Aucune image disponible</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {dates[parcel.id].map(item => {
                          const active = selection?.item.date === item.date && selection?.parcel.id === parcel.id
                          return (
                            <button
                              key={item.date}
                              onClick={() => setSelection({ item, parcel })}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors ${
                                active
                                  ? 'bg-green-600 border-green-600 text-white'
                                  : 'bg-white border-green-200 text-green-800 hover:bg-green-50'
                              }`}
                            >
                              {formatDate(item.date)}
                              {item.cloudCover !== null && (
                                <span className={`inline-flex items-center gap-0.5 ${active ? 'opacity-80' : 'opacity-50'}`}>
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                                    <path d="M4.5 10.196A6 6 0 0 1 12 4a6 6 0 0 1 5.985 5.57A4.5 4.5 0 0 1 17.5 19H6a4.5 4.5 0 0 1-1.5-8.804Z" />
                                  </svg>
                                  {Math.round(item.cloudCover)}%
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Panneau droit — visualisation */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {!selection ? (
            <div className="h-full flex items-center justify-center text-gray-300 text-sm">
              Cliquez sur une date pour afficher l&apos;image
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="px-6 pt-6 pb-3 flex-shrink-0">
                <h2 className="text-base font-semibold text-gray-800">{selection.parcel.name}</h2>
                <p className="text-sm text-gray-400">{formatDate(selection.item.date)}</p>
              </div>

              <div className="flex-1 min-h-0 flex gap-6 px-6 pb-6">
                <div className="flex-1 min-h-0 min-w-0">
                  <ParcelImageViewer item={selection.item} parcelGeometry={selection.parcel.geometry} />
                </div>

                <div className="w-56 flex-shrink-0 bg-white rounded-xl border border-gray-100 p-4 self-start">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Métadonnées</p>
                  {selection.item.platform && (
                    <MetaRow label="Satellite" value={selection.item.platform.replace('sentinel-', 'Sentinel-').toUpperCase()} />
                  )}
                  {selection.item.sunElevation !== null && (
                    <MetaRow label="Élévation soleil" value={`${Math.round(selection.item.sunElevation)}°`} />
                  )}
                  <MetaRow label="Couverture nuageuse" value={pct(selection.item.cloudCover)} />
                  <MetaRow label="Ombres nuages" value={pct(selection.item.cloudShadow)} />
                  <MetaRow label="Végétation" value={pct(selection.item.vegetation)} />
                  <MetaRow label="Eau" value={pct(selection.item.water)} />
                  <MetaRow label="Neige / glace" value={pct(selection.item.snow)} />
                  <MetaRow label="Pixels sans donnée" value={pct(selection.item.nodata)} />
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
