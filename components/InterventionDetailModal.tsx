'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { Intervention, InterventionCategory } from '@/lib/types'
import { supabase } from '@/lib/supabase'

const CATEGORY_LABELS: Record<InterventionCategory, string> = {
  travail_sol:      'Travail du sol',
  semis:            'Semis',
  fertilisation:    'Fertilisation',
  traitement_phyto: 'Traitement phyto',
  irrigation:       'Irrigation',
  recolte:          'Récolte',
  observation:      'Observation',
  autre:            'Autre',
}

const CATEGORY_COLOR: Record<InterventionCategory, string> = {
  travail_sol:      'bg-amber-100 text-amber-700',
  semis:            'bg-gray-100 text-gray-600',
  fertilisation:    'bg-blue-100 text-blue-700',
  traitement_phyto: 'bg-red-100 text-red-700',
  irrigation:       'bg-cyan-100 text-cyan-700',
  recolte:          'bg-yellow-100 text-yellow-700',
  observation:      'bg-purple-100 text-purple-700',
  autre:            'bg-gray-100 text-gray-600',
}

function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === '') return null
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-gray-400 w-36 shrink-0">{label}</span>
      <span className="text-gray-700">{value}</span>
    </div>
  )
}

interface Props {
  intervention: Intervention
  onClose: () => void
  onEdit: () => void
  onDeleted: (id: string) => void
}

export default function InterventionDetailModal({ intervention: i, onClose, onEdit, onDeleted }: Props) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!window.confirm('Supprimer cette intervention ?')) return
    setDeleting(true)
    const { error } = await supabase.from('interventions').delete().eq('id', i.id)
    setDeleting(false)
    if (error) { alert('Erreur lors de la suppression. Réessayez.'); return }
    onDeleted(i.id)
    onClose()
  }

  const hasMeteo = i.meteo_temperature != null || i.meteo_vent_vitesse != null
    || i.meteo_humidite != null || !!i.meteo_conditions

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLOR[i.category]}`}>
              {CATEGORY_LABELS[i.category]}
            </span>
            <span className="text-xs text-gray-400">{fmtDate(i.date)}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">

          {/* Champs communs */}
          <div className="flex flex-col gap-1.5">
            {(i.culture || i.stade_bbch) && (
              <Row label="Culture" value={[i.culture, i.stade_bbch].filter(Boolean).join(' · ')} />
            )}
            <Row label="Opérateur" value={i.operateur} />
            <Row label="Matériel" value={i.materiel} />
            <Row label="Surface traitée" value={i.surface_ha != null ? `${i.surface_ha} ha` : null} />
          </div>

          {/* Phyto */}
          {i.category === 'traitement_phyto' && (i.phyto_produit_nom || i.phyto_amm) && (
            <div className="flex flex-col gap-1.5 pt-3 border-t border-gray-100">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Produit phytosanitaire</p>
              <Row label="Produit" value={i.phyto_produit_nom} />
              <Row label="N° AMM" value={i.phyto_amm} />
              <Row label="Cible" value={i.phyto_cible} />
              <Row label="Dose" value={i.phyto_dose_value != null ? `${i.phyto_dose_value} ${i.phyto_dose_unit ?? ''}` : null} />
              <Row label="Volume bouillie" value={i.phyto_volume_bouillie != null ? `${i.phyto_volume_bouillie} L/ha` : null} />
            </div>
          )}

          {/* Fertilisation */}
          {i.category === 'fertilisation' && (i.ferti_produit || i.ferti_dose_value != null) && (
            <div className="flex flex-col gap-1.5 pt-3 border-t border-gray-100">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Fertilisation</p>
              <Row label="Produit" value={i.ferti_produit} />
              <Row label="N° AMM" value={i.ferti_amm} />
              <Row label="Dose" value={i.ferti_dose_value != null ? `${i.ferti_dose_value} ${i.ferti_dose_unit ?? ''}` : null} />
              {i.ferti_composition && Object.keys(i.ferti_composition).length > 0 && (
                <div className="flex flex-col gap-0.5 mt-0.5">
                  <span className="text-[10px] text-gray-400">Composition :</span>
                  {Object.entries(i.ferti_composition).map(([k, v]) => (
                    <span key={k} className="text-xs text-gray-600 ml-2">· {k} : {v}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Semis */}
          {i.category === 'semis' && (
            <div className="flex flex-col gap-1.5 pt-3 border-t border-gray-100">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Semis</p>
              <Row label="Variété" value={i.semis_variete} />
              <Row label="Densité" value={i.semis_densite_value != null ? `${i.semis_densite_value} ${i.semis_densite_unit ?? ''}` : null} />
              <Row label="Profondeur" value={i.semis_profondeur_cm != null ? `${i.semis_profondeur_cm} cm` : null} />
            </div>
          )}

          {/* Récolte */}
          {i.category === 'recolte' && (
            <div className="flex flex-col gap-1.5 pt-3 border-t border-gray-100">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Récolte</p>
              <Row label="Rendement" value={i.recolte_rendement_value != null ? `${i.recolte_rendement_value} ${i.recolte_rendement_unit ?? ''}` : null} />
              <Row label="Humidité récolte" value={i.recolte_humidite_pct != null ? `${i.recolte_humidite_pct} %` : null} />
              <Row label="Destination" value={i.recolte_destination} />
            </div>
          )}

          {/* Irrigation */}
          {i.category === 'irrigation' && (
            <div className="flex flex-col gap-1.5 pt-3 border-t border-gray-100">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Irrigation</p>
              <Row label="Volume" value={i.irrig_volume_mm != null ? `${i.irrig_volume_mm} mm` : null} />
              <Row label="Durée" value={i.irrig_duree_h != null ? `${i.irrig_duree_h} h` : null} />
            </div>
          )}

          {/* Météo */}
          {hasMeteo && (
            <div className="flex flex-col gap-1.5 pt-3 border-t border-gray-100">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Conditions météo</p>
              <Row label="Température" value={i.meteo_temperature != null ? `${i.meteo_temperature} °C` : null} />
              <Row label="Vent" value={i.meteo_vent_vitesse != null ? `${i.meteo_vent_vitesse} km/h` : null} />
              <Row label="Humidité" value={i.meteo_humidite != null ? `${i.meteo_humidite} %` : null} />
              <Row label="Conditions" value={i.meteo_conditions} />
            </div>
          )}

          {/* Commentaire */}
          {i.commentaire && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Commentaire</p>
              <p className="text-xs text-gray-700 whitespace-pre-wrap">{i.commentaire}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between sticky bottom-0 bg-white">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs text-red-400 hover:text-red-600 hover:underline disabled:opacity-40"
          >
            {deleting ? 'Suppression…' : 'Supprimer'}
          </button>
          <div className="flex gap-3">
            <button onClick={onClose} className="text-sm text-gray-500 hover:underline">Fermer</button>
            <button
              onClick={onEdit}
              className="px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-700"
            >
              Modifier
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
