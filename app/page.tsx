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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow px-6 py-3 flex items-center justify-between">
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

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-800">Mes parcelles</h1>
          <Link href="/map" className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">
            + Ajouter
          </Link>
        </div>

        {fetchError ? (
          <p className="text-red-500 text-sm">{fetchError}</p>
        ) : parcels.length === 0 ? (
          <p className="text-gray-500 text-sm">
            Aucune parcelle. Cliquez sur &ldquo;+ Ajouter&rdquo; pour dessiner votre première parcelle.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {parcels.map(parcel => (
              <li key={parcel.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-gray-800">{parcel.name}</span>
                  <button
                    onClick={() => deleteParcel(parcel.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Supprimer
                  </button>
                </div>
                <div className="text-sm">
                  <p className="text-gray-400 text-xs mb-1">Dernières images Sentinel disponibles</p>
                  {dates[parcel.id] === undefined ? (
                    <span className="text-gray-400">Chargement…</span>
                  ) : dates[parcel.id].length === 0 ? (
                    <span className="text-gray-400">Aucune image disponible</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {dates[parcel.id].map(item => (
                        <button
                          key={item.date}
                          onClick={() => setSelection({ item, parcel })}
                          className="px-2 py-1 bg-green-50 border border-green-200 rounded text-xs text-green-800 font-medium hover:bg-green-100"
                        >
                          {formatDate(item.date)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {selection && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setSelection(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-2xl w-full overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-700">{selection.parcel.name}</span>
                <span className="text-xs text-gray-400">{formatDate(selection.item.date)}</span>
              </div>
              <button onClick={() => setSelection(null)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
            </div>
            <ParcelImageViewer item={selection.item} parcelGeometry={selection.parcel.geometry} />
          </div>
        </div>
      )}
    </div>
  )
}
