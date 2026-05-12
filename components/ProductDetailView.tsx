'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { SearchResultItem, UsagePhyto, UsageMfsc } from '@/lib/types'

interface Props {
  product: SearchResultItem | null
}

function MetaRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-xs font-medium text-right" style={{ color: valueColor ?? 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

function statutColor(statut: string | null): string {
  if (!statut) return 'var(--text-muted)'
  const s = statut.toLowerCase()
  if (s.includes('autoris')) return 'rgba(0,0,0,0.70)'
  if (s.includes('retrait') || s.includes('refus') || s.includes('suspendu')) return '#f87171'
  return 'var(--text-secondary)'
}

function etatColor(etat: string): string {
  const e = etat.toLowerCase()
  if (e.includes('autoris')) return 'rgba(0,0,0,0.70)'
  if (e.includes('retrait') || e.includes('refus') || e.includes('suspendu')) return '#f87171'
  return 'var(--text-faint)'
}

function formatIsoDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function PhytoUsageCard({ u }: { u: UsagePhyto }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.06)' }}>
      {u.nuisible && (
        <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{u.nuisible}</p>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {u.type_traitement && (
          <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Type : {u.type_traitement}</span>
        )}
        {u.dose_retenue && (
          <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Dose : {u.dose_retenue}{u.dose_unite ? ` ${u.dose_unite}` : ''}</span>
        )}
        {u.dar_jours !== null && (
          <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>DAR : {u.dar_jours} j</span>
        )}
        {u.nb_max_applications !== null && (
          <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Max {u.nb_max_applications} appl.</span>
        )}
        {u.intervalle_min_jours !== null && (
          <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Intervalle min : {u.intervalle_min_jours} j</span>
        )}
      </div>
      {(u.znt_aquatique_m !== null || u.znt_arthropodes_m !== null || u.znt_plantes_m !== null) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
          {u.znt_aquatique_m !== null && (
            <span className="text-[10px] text-blue-400">ZNT eau {u.znt_aquatique_m} m</span>
          )}
          {u.znt_arthropodes_m !== null && (
            <span className="text-[10px] text-amber-400">ZNT arthro. {u.znt_arthropodes_m} m</span>
          )}
          {u.znt_plantes_m !== null && (
            <span className="text-[10px] text-gray-500">ZNT plantes {u.znt_plantes_m} m</span>
          )}
        </div>
      )}
      {u.etat_usage && (
        <p className="text-[10px] mt-1.5 font-medium" style={{ color: etatColor(u.etat_usage) }}>{u.etat_usage}</p>
      )}
      {u.condition_emploi && (
        <p className="text-[10px] mt-1.5 italic leading-relaxed" style={{ color: 'var(--text-faint)' }}>{u.condition_emploi}</p>
      )}
      {(u.date_fin_distribution || u.date_fin_utilisation) && (
        <div className="flex flex-wrap gap-x-4 mt-1.5">
          {u.date_fin_distribution && (
            <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>Fin distrib. : {formatIsoDate(u.date_fin_distribution)}</span>
          )}
          {u.date_fin_utilisation && (
            <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>Fin util. : {formatIsoDate(u.date_fin_utilisation)}</span>
          )}
        </div>
      )}
    </div>
  )
}

function MfscUsageCard({ u }: { u: UsageMfsc }) {
  const doseStr = (() => {
    if (u.dose_min !== null && u.dose_max !== null && u.dose_min !== u.dose_max)
      return `${u.dose_min} – ${u.dose_max} ${u.dose_min_unite ?? u.dose_max_unite ?? ''}`
    if (u.dose_min !== null)
      return `${u.dose_min} ${u.dose_min_unite ?? ''}`
    if (u.dose_max !== null)
      return `${u.dose_max} ${u.dose_max_unite ?? ''}`
    return null
  })()

  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.06)' }}>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {doseStr && (
          <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Dose : {doseStr}</span>
        )}
        {u.etat_usage && (
          <span className="text-[10px] font-medium" style={{ color: etatColor(u.etat_usage) }}>{u.etat_usage}</span>
        )}
      </div>
      {u.culture_commentaire && (
        <p className="text-[10px] mt-1.5 italic leading-relaxed" style={{ color: 'var(--text-faint)' }}>{u.culture_commentaire}</p>
      )}
    </div>
  )
}

export default function ProductDetailView({ product }: Props) {
  const [usagesPhyto, setUsagesPhyto] = useState<UsagePhyto[]>([])
  const [usagesMfsc, setUsagesMfsc] = useState<UsageMfsc[]>([])
  const [loadingUsages, setLoadingUsages] = useState(false)
  const [selectedCulture, setSelectedCulture] = useState<string | null>(null)

  useEffect(() => {
    if (!product) return
    let cancelled = false
    setUsagesPhyto([])
    setUsagesMfsc([])
    setSelectedCulture(null)
    setLoadingUsages(true)

    if (product.kind === 'phyto') {
      supabase
        .from('usages_phyto')
        .select('*')
        .eq('amm', product.amm)
        .then(({ data, error }) => {
          if (cancelled) return
          if (!error) setUsagesPhyto((data ?? []) as UsagePhyto[])
          setLoadingUsages(false)
        })
    } else {
      supabase
        .from('usages_mfsc')
        .select('*')
        .eq('amm', product.amm)
        .then(({ data, error }) => {
          if (cancelled) return
          if (!error) setUsagesMfsc((data ?? []) as UsageMfsc[])
          setLoadingUsages(false)
        })
    }

    return () => { cancelled = true }
  }, [product?.amm, product?.kind])

  if (!product) {
    return (
      <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--text-faint)' }}>
        Sélectionnez un produit pour afficher sa fiche
      </div>
    )
  }

  const cultures = product.kind === 'phyto'
    ? [...new Set(usagesPhyto.map(u => u.culture_ephy))].sort()
    : [...new Set(usagesMfsc.map(u => u.type_culture))].sort()

  const filteredPhyto = selectedCulture ? usagesPhyto.filter(u => u.culture_ephy === selectedCulture) : []
  const filteredMfsc = selectedCulture ? usagesMfsc.filter(u => u.type_culture === selectedCulture) : []

  return (
    <div className="h-full overflow-y-auto px-4 md:px-6 py-6">
      {/* En-tête produit */}
      <div className="mb-4">
        <div className="flex items-start gap-3 mb-1">
          <h2 className="text-base font-semibold leading-tight flex-1" style={{ color: 'var(--text-primary)' }}>
            {product.nom}
          </h2>
          <span className={`text-xs font-semibold px-2 py-1 rounded shrink-0 ${product.kind === 'phyto' ? 'text-red-400 bg-red-400/10' : 'text-blue-400 bg-blue-400/10'}`}>
            {product.kind === 'phyto' ? 'Phyto' : 'MFSC'}
          </span>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>AMM {product.amm}</p>
      </div>

      {/* Informations générales */}
      <div className="glass rounded-2xl p-4 mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
          Informations générales
        </p>
        {product.type_produit && (
          <MetaRow label="Type / Fonction" value={product.type_produit} />
        )}
        {product.kind === 'phyto' && (
          <>
            {product.titulaire && <MetaRow label="Titulaire" value={product.titulaire} />}
            <MetaRow
              label="Statut"
              value={product.statut ?? '—'}
              valueColor={statutColor(product.statut)}
            />
            <MetaRow label="Date d'AMM" value={formatIsoDate(product.date_amm)} />
            {product.date_retrait && (
              <MetaRow label="Date de retrait" value={formatIsoDate(product.date_retrait)} valueColor="#f87171" />
            )}
          </>
        )}
        {product.kind === 'mfsc' && product.composition && (
          <div className="py-1.5">
            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Composition</p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>{product.composition}</p>
          </div>
        )}
      </div>

      {/* Usages */}
      <div className="glass rounded-2xl p-4">
        <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--text-muted)' }}>
          Usages {product.kind === 'phyto' ? '— e-phy' : '— MFSC'}
        </p>

        {loadingUsages ? (
          <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Chargement…</p>
        ) : cultures.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Aucun usage enregistré</p>
        ) : (
          <>
            {/* Pills cultures — même style que les dates Sentinel */}
            <div className="flex gap-2 flex-wrap mb-4">
              {cultures.map(c => (
                <button
                  key={c}
                  onClick={() => setSelectedCulture(prev => prev === c ? null : c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${selectedCulture === c ? 'pill-active' : 'pill-glass'}`}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Détail des usages pour la culture sélectionnée */}
            {selectedCulture && (
              <div className="flex flex-col gap-2">
                {product.kind === 'phyto'
                  ? filteredPhyto.map(u => <PhytoUsageCard key={u.id} u={u} />)
                  : filteredMfsc.map(u => <MfscUsageCard key={u.id} u={u} />)
                }
              </div>
            )}

            {!selectedCulture && (
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                {cultures.length} culture{cultures.length > 1 ? 's' : ''} — cliquez pour afficher les usages
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
