'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const MapComponent = dynamic(() => import('@/components/MapComponent'), { ssr: false })

export default function MapPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)
    })
  }, [router])

  if (!userId) return null

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center gap-4 px-4 py-3 bg-white shadow z-10 shrink-0">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-800 py-1 pr-2">← Retour</Link>
        <span className="font-bold text-green-700">Dessiner une parcelle</span>
      </header>
      <div className="flex-1 min-h-0">
        <MapComponent userId={userId} onSaved={() => router.push('/')} />
      </div>
    </div>
  )
}
