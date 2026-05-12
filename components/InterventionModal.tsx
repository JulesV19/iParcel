'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Intervention, InterventionCategory, ProduitPhyto, ProduitMfsc } from '@/lib/types'
import type { WeatherData } from '@/lib/weather'
import { weatherCodeLabel } from '@/lib/weather'
import {
  Layers, Sprout, Droplets, FlaskConical, Waves, Wheat, Eye, MoreHorizontal, X,
} from 'lucide-react'

const CULTURES = [
  'Blé tendre', 'Blé dur', "Orge d'hiver", 'Orge de printemps', 'Maïs grain',
  'Maïs fourrage', 'Colza', 'Tournesol', 'Betterave sucrière', 'Pomme de terre',
  'Soja', 'Pois protéagineux', 'Féverole', 'Lin textile', 'Lin oléagineux',
  'Chanvre industriel', 'Triticale', 'Seigle', 'Avoine', 'Sarrasin', 'Sorgho', 'Millet',
]

interface AuthUsage {
  nuisible: string | null
  dose_retenue: string | null
  dose_unite: string | null
}

type CompatData =
  | { status: 'idle' | 'checking' | 'unknown' | 'not_authorized' }
  | { status: 'authorized'; usages: AuthUsage[] }

interface MfscUsage {
  dose_min: number | null
  dose_min_unite: string | null
  dose_max: number | null
  dose_max_unite: string | null
}

interface CompositionItem {
  name: string
  min: number | null
  max: number | null
  unit: string
}

type FertiCompatData =
  | { status: 'idle' | 'checking' | 'not_authorized' }
  | { status: 'authorized'; usages: MfscUsage[] }

function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim()
}

function parseComposition(raw: string | null): CompositionItem[] {
  if (!raw?.trim()) return []
  return raw.split(' | ').map(part => {
    const m = part.trim().match(/^(.+?)\s*\(Min:\s*([\d.]*)\s*([^,]*?),\s*Max:\s*([\d.]*)\s*(.*?)\)\s*$/)
    if (!m) return null
    return {
      name: m[1].trim(),
      min: m[2] ? parseFloat(m[2]) : null,
      max: m[4] ? parseFloat(m[4]) : null,
      unit: (m[3] || m[5] || '').trim(),
    }
  }).filter((x): x is CompositionItem => x !== null)
}

function parseMaxDose(raw: string): number | null {
  const nums = raw.match(/\d+(?:[.,]\d+)?/g)
  if (!nums) return null
  return Math.max(...nums.map(n => parseFloat(n.replace(',', '.'))))
}

function deriveIssues(usages: AuthUsage[], cible: string, doseValue: string, doseUnit: string) {
  let cibleIssue: string[] | null = null
  let doseIssue: string | null = null

  if (cible.trim()) {
    const terms = cible.split(',').map(t => norm(t)).filter(Boolean)
    const normNuisibles = usages.map(u => norm(u.nuisible ?? ''))
    const hasUnmatched = terms.some(t => !normNuisibles.some(n => n.includes(t) || t.includes(n)))
    if (hasUnmatched) cibleIssue = [...new Set(usages.map(u => u.nuisible).filter(Boolean))] as string[]
  }

  if (doseValue.trim()) {
    const userDose = parseFloat(doseValue)
    const sameUnit = usages.filter(u => u.dose_unite === doseUnit && u.dose_retenue)
    if (sameUnit.length > 0) {
      const maxDose = Math.max(...sameUnit.map(u => parseMaxDose(u.dose_retenue!) ?? 0))
      if (!isNaN(maxDose) && userDose > maxDose) doseIssue = `${maxDose} ${doseUnit}`
    }
  }

  return { cibleIssue, doseIssue }
}

// Correspondance culture iParcel → nom dans la base e-phy ANSES
// null = aucune catégorie e-phy disponible → compatibilité non vérifiable
const CULTURE_TO_EPHY: Record<string, string | null> = {
  'Blé tendre':          'Blé',
  'Blé dur':             'Blé',
  "Orge d'hiver":        'Orge',
  'Orge de printemps':   'Orge',
  'Maïs grain':          'Maïs',
  'Maïs fourrage':       'Maïs',
  'Colza':               'Crucifères oléagineuses',
  'Tournesol':           'Tournesol',
  'Betterave sucrière':  'Betterave industrielle et fourragère',
  'Pomme de terre':      'Pomme de terre',
  'Soja':                'Soja',
  'Pois protéagineux':   'Graines protéagineuses',
  'Féverole':            'Graines protéagineuses',
  'Lin textile':         'Lin',
  'Lin oléagineux':      'Lin',
  'Chanvre industriel':  'Chanvre',
  'Triticale':           'Céréales à paille',
  'Seigle':              'Seigle',
  'Avoine':              'Avoine',
  'Sarrasin':            'Sarrasin',
  'Sorgho':              'Sorgho',
  'Millet':              null,
}

const BBCH_STAGES = [
  '00 – Graine sèche', '09 – Germination', '10 – Levée',
  '11 – 1 feuille', '12 – 2 feuilles', '13 – 3 feuilles', '14 – 4 feuilles', '15 – 5 feuilles',
  '21 – 1 talle', '22 – 2 talles', '25 – 5 talles', '29 – Fin de tallage',
  '30 – Début montaison', '31 – 1er nœud', '37 – Dernière feuille visible',
  '39 – Gonflement', '51 – Début épiaison', '59 – Épiaison terminée',
  '61 – Début floraison', '65 – Pleine floraison', '69 – Fin floraison',
  '71 – Nouaison', '75 – Grain laiteux', '83 – Grain pâteux',
  '85 – Maturité cireuse', '89 – Maturité complète', '92 – Sénescence',
]


const CATEGORIES: Array<{ key: InterventionCategory; label: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = [
  { key: 'travail_sol',      label: 'Travail du sol',   Icon: Layers },
  { key: 'semis',            label: 'Semis',             Icon: Sprout },
  { key: 'fertilisation',    label: 'Fertilisation',     Icon: Droplets },
  { key: 'traitement_phyto', label: 'Traitement phyto',  Icon: FlaskConical },
  { key: 'irrigation',       label: 'Irrigation',        Icon: Waves },
  { key: 'recolte',          label: 'Récolte',           Icon: Wheat },
  { key: 'observation',      label: 'Observation',       Icon: Eye },
  { key: 'autre',            label: 'Autre',             Icon: MoreHorizontal },
]

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface FormState {
  category: InterventionCategory | ''
  date: string
  culture: string
  stade_bbch: string
  operateur: string
  materiel: string
  surface_ha: string
  meteo_auto: boolean
  meteo_temperature: string
  meteo_vent_vitesse: string
  meteo_humidite: string
  meteo_conditions: string
  commentaire: string
  phyto_produit_id: string
  phyto_produit_nom: string
  phyto_amm: string
  phyto_cible: string
  phyto_dose_value: string
  phyto_dose_unit: string
  phyto_volume_bouillie: string
  ferti_produit: string
  ferti_amm: string
  ferti_dose_value: string
  ferti_dose_unit: string
  semis_variete: string
  semis_densite_value: string
  semis_densite_unit: string
  semis_profondeur: string
  recolte_rendement_value: string
  recolte_rendement_unit: string
  recolte_humidite: string
  recolte_destination: string
  irrig_volume: string
  irrig_duree: string
}

const INITIAL: FormState = {
  category: '', date: '', culture: '', stade_bbch: '',
  operateur: '', materiel: '', surface_ha: '',
  meteo_auto: false, meteo_temperature: '', meteo_vent_vitesse: '', meteo_humidite: '', meteo_conditions: '',
  commentaire: '',
  phyto_produit_id: '', phyto_produit_nom: '', phyto_amm: '', phyto_cible: '',
  phyto_dose_value: '', phyto_dose_unit: 'L/ha', phyto_volume_bouillie: '',
  ferti_produit: '', ferti_amm: '', ferti_dose_value: '', ferti_dose_unit: 'kg/ha',
  semis_variete: '', semis_densite_value: '', semis_densite_unit: 'kg/ha', semis_profondeur: '',
  recolte_rendement_value: '', recolte_rendement_unit: 't/ha', recolte_humidite: '', recolte_destination: '',
  irrig_volume: '', irrig_duree: '',
}

interface Props {
  parcelId: string
  userId: string
  currentWeather: WeatherData | null
  onClose: () => void
  onSaved: (intervention: Intervention) => void
  intervention?: Intervention // si fourni → mode édition
}

function formFromIntervention(i: Intervention): FormState {
  const str = (v: number | null | undefined) => v != null ? String(v) : ''
  return {
    category: i.category,
    date: i.date,
    culture: i.culture ?? '',
    stade_bbch: i.stade_bbch ?? '',
    operateur: i.operateur ?? '',
    materiel: i.materiel ?? '',
    surface_ha: str(i.surface_ha),
    meteo_auto: false,
    meteo_temperature: str(i.meteo_temperature),
    meteo_vent_vitesse: str(i.meteo_vent_vitesse),
    meteo_humidite: str(i.meteo_humidite),
    meteo_conditions: i.meteo_conditions ?? '',
    commentaire: i.commentaire ?? '',
    phyto_produit_id: i.phyto_produit_id ?? '',
    phyto_produit_nom: i.phyto_produit_nom ?? '',
    phyto_amm: i.phyto_amm ?? '',
    phyto_cible: i.phyto_cible ?? '',
    phyto_dose_value: str(i.phyto_dose_value),
    phyto_dose_unit: i.phyto_dose_unit ?? 'L/ha',
    phyto_volume_bouillie: str(i.phyto_volume_bouillie),
    ferti_produit: i.ferti_produit ?? '',
    ferti_amm: i.ferti_amm ?? '',
    ferti_dose_value: str(i.ferti_dose_value),
    ferti_dose_unit: i.ferti_dose_unit ?? 'kg/ha',
    semis_variete: i.semis_variete ?? '',
    semis_densite_value: str(i.semis_densite_value),
    semis_densite_unit: i.semis_densite_unit ?? 'kg/ha',
    semis_profondeur: str(i.semis_profondeur_cm),
    recolte_rendement_value: str(i.recolte_rendement_value),
    recolte_rendement_unit: i.recolte_rendement_unit ?? 't/ha',
    recolte_humidite: str(i.recolte_humidite_pct),
    recolte_destination: i.recolte_destination ?? '',
    irrig_volume: str(i.irrig_volume_mm),
    irrig_duree: str(i.irrig_duree_h),
  }
}

function CompatBlock({ data, culture, cible, doseValue, doseUnit }: {
  data: CompatData
  culture: string
  cible: string
  doseValue: string
  doseUnit: string
}) {
  if (data.status === 'idle') return null

  if (data.status === 'checking') return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 text-gray-400 text-xs">
      <span className="animate-spin inline-block w-3 h-3 border border-gray-400 border-t-transparent rounded-full" />
      Vérification e-phy…
    </div>
  )

  if (data.status === 'unknown') return (
    <div className="px-3 py-2 rounded-lg bg-gray-50 text-gray-500 text-xs">
      — Compatibilité non vérifiable pour cette culture
    </div>
  )

  if (data.status === 'not_authorized') return (
    <div className="px-3 py-2 rounded-lg bg-red-50 text-red-700 text-xs">
      ✗ Produit non autorisé sur {culture} selon e-phy ANSES
    </div>
  )

  if (data.status !== 'authorized') return null
  const { cibleIssue, doseIssue } = deriveIssues(data.usages, cible, doseValue, doseUnit)
  const hasIssues = cibleIssue || doseIssue

  if (!hasIssues) return (
    <div className="px-3 py-2 rounded-lg bg-gray-50 text-gray-600 text-xs">
      ✓ Conforme e-phy ANSES — produit autorisé sur {culture}
    </div>
  )

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5 rounded-lg bg-orange-50 text-orange-800 text-xs">
      <p className="font-medium">⚠ Non-conformité e-phy ANSES</p>
      {cibleIssue && (
        <div>
          <p>Cible non reconnue pour ce produit sur {culture}.</p>
          <p className="text-orange-600 mt-0.5">
            Cibles autorisées : {cibleIssue.slice(0, 8).join(', ')}{cibleIssue.length > 8 ? `… (+${cibleIssue.length - 8})` : ''}
          </p>
        </div>
      )}
      {doseIssue && (
        <p>Dose dépassée. Maximum autorisé : <span className="font-medium">{doseIssue}</span></p>
      )}
    </div>
  )
}

function FertiCompatBlock({ data, culture, doseValue, doseUnit }: {
  data: FertiCompatData
  culture: string
  doseValue: string
  doseUnit: string
}) {
  if (data.status === 'idle') return null

  if (data.status === 'checking') return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 text-gray-400 text-xs">
      <span className="animate-spin inline-block w-3 h-3 border border-gray-400 border-t-transparent rounded-full" />
      Vérification e-phy MFSC…
    </div>
  )

  if (data.status === 'not_authorized') return (
    <div className="px-3 py-2 rounded-lg bg-red-50 text-red-700 text-xs">
      ✗ Produit non autorisé sur {culture || 'cette culture'} selon e-phy ANSES
    </div>
  )

  if (data.status !== 'authorized') return null

  let minIssue: string | null = null
  let maxIssue: string | null = null

  if (doseValue.trim()) {
    const userDose = parseFloat(doseValue)
    const withMax = data.usages.filter(u => u.dose_max_unite === doseUnit && u.dose_max != null)
    const withMin = data.usages.filter(u => u.dose_min_unite === doseUnit && u.dose_min != null)
    if (withMax.length > 0) {
      const maxDose = Math.max(...withMax.map(u => u.dose_max!))
      if (!isNaN(maxDose) && userDose > maxDose) maxIssue = `${maxDose} ${doseUnit}`
    }
    if (withMin.length > 0) {
      const minDose = Math.min(...withMin.map(u => u.dose_min!))
      if (!isNaN(minDose) && userDose < minDose) minIssue = `${minDose} ${doseUnit}`
    }
  }

  if (!minIssue && !maxIssue) return (
    <div className="px-3 py-2 rounded-lg bg-gray-50 text-gray-600 text-xs">
      ✓ Conforme e-phy ANSES — produit autorisé sur {culture || 'cette culture'}
    </div>
  )

  return (
    <div className="flex flex-col gap-1 px-3 py-2.5 rounded-lg bg-orange-50 text-orange-800 text-xs">
      <p className="font-medium">⚠ Non-conformité e-phy ANSES</p>
      {minIssue && <p>Dose insuffisante. Minimum autorisé : <span className="font-medium">{minIssue}</span></p>}
      {maxIssue && <p>Dose dépassée. Maximum autorisé : <span className="font-medium">{maxIssue}</span></p>}
    </div>
  )
}

export default function InterventionModal({ parcelId, userId, currentWeather, onClose, onSaved, intervention }: Props) {
  const [form, setForm] = useState<FormState>(() =>
    intervention ? formFromIntervention(intervention) : { ...INITIAL, date: todayStr() }
  )
  const [saving, setSaving] = useState(false)
  const [phytoSearch, setPhytoSearch] = useState(intervention?.phyto_produit_nom ?? '')
  const [phytoResults, setPhytoResults] = useState<ProduitPhyto[]>([])
  const [phytoLoading, setPhytoLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [compatData, setCompatData] = useState<CompatData>({ status: 'idle' })
  const [fertiSearch, setFertiSearch] = useState(intervention?.ferti_produit ?? '')
  const [fertiResults, setFertiResults] = useState<ProduitMfsc[]>([])
  const [fertiLoading, setFertiLoading] = useState(false)
  const [showFertiDropdown, setShowFertiDropdown] = useState(false)
  const [fertiCompatData, setFertiCompatData] = useState<FertiCompatData>({ status: 'idle' })
  const [fertiCompositionItems, setFertiCompositionItems] = useState<CompositionItem[] | null>(null)
  const [fertiCompositionValues, setFertiCompositionValues] = useState<Record<string, string>>({})

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // Phyto product search with debounce
  useEffect(() => {
    if (phytoSearch.length < 2) { setPhytoResults([]); setShowDropdown(false); return }
    if (phytoSearch === form.phyto_produit_nom) return // produit déjà sélectionné
    const timer = setTimeout(async () => {
      setPhytoLoading(true)
      const { data } = await supabase
        .from('produits_phyto')
        .select('id, amm, nom_commercial, titulaire, type_produit, statut')
        .or(`nom_commercial.ilike.%${phytoSearch}%,amm.ilike.%${phytoSearch}%`)
        .limit(8)
      setPhytoResults((data ?? []) as ProduitPhyto[])
      setPhytoLoading(false)
      setShowDropdown(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [phytoSearch])

  // Recherche produit MFSC avec débounce
  useEffect(() => {
    if (fertiSearch.length < 2) { setFertiResults([]); setShowFertiDropdown(false); return }
    if (fertiSearch === form.ferti_produit) return
    const timer = setTimeout(async () => {
      setFertiLoading(true)
      const { data } = await supabase
        .from('produits_mfsc')
        .select('id, amm, nom_produit, type_produit, composition')
        .or(`nom_produit.ilike.%${fertiSearch}%,amm.ilike.%${fertiSearch}%`)
        .limit(8)
      setFertiResults((data ?? []) as ProduitMfsc[])
      setFertiLoading(false)
      setShowFertiDropdown(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [fertiSearch])

  // Fetch usages MFSC autorisés dès que (AMM ferti, culture) sont connus
  useEffect(() => {
    if (form.category !== 'fertilisation' || !form.ferti_amm || !form.culture) {
      setFertiCompatData({ status: 'idle' })
      return
    }

    setFertiCompatData({ status: 'checking' })
    supabase
      .from('usages_mfsc')
      .select('dose_min, dose_min_unite, dose_max, dose_max_unite')
      .eq('amm', form.ferti_amm)
      .eq('type_culture', 'Grandes cultures')
      .eq('etat_usage', 'Autorisé')
      .then(({ data }) => {
        if (!data || data.length === 0) setFertiCompatData({ status: 'not_authorized' })
        else setFertiCompatData({ status: 'authorized', usages: data as MfscUsage[] })
      })
  }, [form.category, form.culture, form.ferti_amm])

  // Fetch usages autorisés dès que (AMM, culture) sont connus
  useEffect(() => {
    if (form.category !== 'traitement_phyto' || !form.culture || !form.phyto_amm) {
      setCompatData({ status: 'idle' })
      return
    }
    const ephyName = CULTURE_TO_EPHY[form.culture]
    if (ephyName === null) { setCompatData({ status: 'unknown' }); return }
    if (ephyName === undefined) { setCompatData({ status: 'idle' }); return }

    setCompatData({ status: 'checking' })
    set('phyto_cible', '')
    supabase
      .from('usages_phyto')
      .select('nuisible, dose_retenue, dose_unite')
      .eq('amm', form.phyto_amm)
      .eq('culture_ephy', ephyName)
      .in('etat_usage', ['Autorisé', 'Autorisé (Provisoire)'])
      .then(({ data }) => {
        if (!data || data.length === 0) setCompatData({ status: 'not_authorized' })
        else setCompatData({ status: 'authorized', usages: data as AuthUsage[] })
      })
  }, [form.category, form.culture, form.phyto_amm])

  // Auto-fill météo when toggled on or date changes
  useEffect(() => {
    if (!form.meteo_auto || !currentWeather) return
    const day = currentWeather.days.find(d => d.date === form.date)
    if (!day) return
    const todayDate = currentWeather.days[currentWeather.todayIndex]?.date
    const isToday = form.date === todayDate
    setForm(prev => ({
      ...prev,
      meteo_temperature: String(Math.round((day.tempMax + day.tempMin) / 2)),
      meteo_vent_vitesse: isToday ? String(currentWeather.current.windKmh) : String(day.windSpeedMax),
      meteo_humidite: isToday ? String(currentWeather.current.humidity) : '',
      meteo_conditions: weatherCodeLabel(isToday ? currentWeather.current.weatherCode : day.weatherCode),
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.meteo_auto, form.date])

  // En mode édition : charger la composition MFSC si un produit ferti est déjà sélectionné
  useEffect(() => {
    if (!intervention?.ferti_amm) return
    supabase
      .from('produits_mfsc')
      .select('composition')
      .eq('amm', intervention.ferti_amm)
      .single()
      .then(({ data }) => {
        const items = parseComposition(data?.composition ?? null)
        setFertiCompositionItems(items)
        const savedCompo = intervention.ferti_composition ?? {}
        const initialValues: Record<string, string> = {}
        for (const item of items) {
          if (savedCompo[item.name] !== undefined) {
            initialValues[item.name] = savedCompo[item.name]
          } else if (item.min !== null && item.max !== null && item.min === item.max) {
            initialValues[item.name] = String(item.min)
          }
        }
        setFertiCompositionValues(initialValues)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Désactiver meteo_auto si la date sort de la plage chargée
  useEffect(() => {
    if (!form.meteo_auto || !currentWeather) return
    const inRange = currentWeather.days.some(d => d.date === form.date)
    if (!inRange) set('meteo_auto', false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.date])

  function selectProduct(p: ProduitPhyto) {
    setForm(prev => ({
      ...prev,
      phyto_produit_id: p.id,
      phyto_produit_nom: p.nom_commercial,
      phyto_amm: p.amm,
    }))
    setPhytoSearch(p.nom_commercial)
    setShowDropdown(false)
  }

  function selectFertiProduct(p: ProduitMfsc) {
    const items = parseComposition(p.composition)
    const initialValues: Record<string, string> = {}
    for (const item of items) {
      if (item.min !== null && item.max !== null && item.min === item.max) {
        initialValues[item.name] = String(item.min)
      }
    }
    setFertiCompositionItems(items)
    setFertiCompositionValues(initialValues)
    setForm(prev => ({ ...prev, ferti_produit: p.nom_produit, ferti_amm: p.amm }))
    setFertiSearch(p.nom_produit)
    setShowFertiDropdown(false)
  }

  async function handleSave() {
    if (!form.category || !form.date || saving) return
    setSaving(true)

    const n = (v: string) => (v ? parseFloat(v) : null)

    const payload = {
      user_id: userId,
      parcel_id: parcelId,
      category: form.category,
      date: form.date,
      culture: form.culture || null,
      stade_bbch: form.stade_bbch || null,
      operateur: form.operateur || null,
      materiel: form.materiel || null,
      surface_ha: n(form.surface_ha),
      meteo_auto: form.meteo_auto,
      meteo_temperature: n(form.meteo_temperature),
      meteo_vent_vitesse: n(form.meteo_vent_vitesse),
      meteo_humidite: n(form.meteo_humidite),
      meteo_conditions: form.meteo_conditions || null,
      commentaire: form.commentaire || null,
      phyto_produit_id: form.phyto_produit_id || null,
      phyto_produit_nom: form.phyto_produit_nom || null,
      phyto_amm: form.phyto_amm || null,
      phyto_cible: form.phyto_cible || null,
      phyto_dose_value: n(form.phyto_dose_value),
      phyto_dose_unit: form.phyto_dose_unit || null,
      phyto_volume_bouillie: n(form.phyto_volume_bouillie),
      ferti_produit: form.ferti_produit || null,
      ferti_amm: form.ferti_amm || null,
      ferti_dose_value: n(form.ferti_dose_value),
      ferti_dose_unit: form.ferti_dose_unit || null,
      ferti_composition: (() => {
        const filled = Object.fromEntries(Object.entries(fertiCompositionValues).filter(([, v]) => v !== ''))
        return Object.keys(filled).length > 0 ? filled : null
      })(),
      semis_variete: form.semis_variete || null,
      semis_densite_value: n(form.semis_densite_value),
      semis_densite_unit: form.semis_densite_unit || null,
      semis_profondeur_cm: n(form.semis_profondeur),
      recolte_rendement_value: n(form.recolte_rendement_value),
      recolte_rendement_unit: form.recolte_rendement_unit || null,
      recolte_humidite_pct: n(form.recolte_humidite),
      recolte_destination: form.recolte_destination || null,
      irrig_volume_mm: n(form.irrig_volume),
      irrig_duree_h: n(form.irrig_duree),
    }

    const query = intervention
      ? supabase.from('interventions').update(payload).eq('id', intervention.id).select('*').single()
      : supabase.from('interventions').insert(payload).select('*').single()

    const { data: saved, error } = await query
    setSaving(false)
    if (error || !saved) {
      alert("Erreur lors de l'enregistrement. Réessayez.")
      return
    }
    onSaved(saved as Intervention)
    onClose()
  }

  const inp = 'w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300'
  const inpWarn = 'w-full border border-orange-400 rounded px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400'
  const lbl = 'block text-xs text-gray-500 mb-1'
  const cat = form.category

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-sm font-semibold text-gray-800">{intervention ? 'Modifier l\'intervention' : 'Nouvelle intervention'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-5">

          {/* Catégorie */}
          <div>
            <p className={lbl}>Catégorie *</p>
            <div className="grid grid-cols-4 gap-2">
              {CATEGORIES.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => set('category', key)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-center transition-colors ${
                    cat === key
                      ? 'bg-gray-800 border-gray-800 text-white'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Icon size={16} />
                  <span className="text-[10px] leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {cat && (
            <>
              {/* Champs communs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label className={lbl}>Date *</label>
                  <input type="date" className={`${inp} max-w-full`} value={form.date} onChange={e => set('date', e.target.value)} />
                </div>
                <div>
                  <label className={lbl}>Surface traitée (ha)</label>
                  <input type="number" className={inp} placeholder="ex : 12.5" min="0" step="0.01"
                    value={form.surface_ha} onChange={e => set('surface_ha', e.target.value)} />
                </div>
                <div>
                  <label className={lbl}>Culture</label>
                  <select className={inp} value={form.culture} onChange={e => set('culture', e.target.value)}>
                    <option value="">— Sélectionner —</option>
                    {CULTURES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Stade BBCH</label>
                  <select className={inp} value={form.stade_bbch} onChange={e => set('stade_bbch', e.target.value)}>
                    <option value="">— Sélectionner —</option>
                    {BBCH_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Opérateur</label>
                  <input type="text" className={inp} placeholder="Nom" value={form.operateur} onChange={e => set('operateur', e.target.value)} />
                </div>
                <div>
                  <label className={lbl}>Matériel</label>
                  <input type="text" className={inp} placeholder="ex : Pulvé 24 m" value={form.materiel} onChange={e => set('materiel', e.target.value)} />
                </div>
              </div>

              {/* ── Traitement phytosanitaire ── */}
              {cat === 'traitement_phyto' && (
                <div className="flex flex-col gap-3 pt-1">
                  <p className="text-xs font-medium text-gray-700 border-t border-gray-100 pt-3">Produit phytosanitaire</p>
                  <div className="relative">
                    <label className={lbl}>Rechercher un produit (nom ou AMM)</label>
                    <input
                      type="text"
                      className={inp}
                      placeholder="ex : Prosaro, 2090111…"
                      value={phytoSearch}
                      onChange={e => {
                        setPhytoSearch(e.target.value)
                        if (!e.target.value) {
                          set('phyto_produit_id', '')
                          set('phyto_produit_nom', '')
                          set('phyto_amm', '')
                        }
                      }}
                      onFocus={() => phytoResults.length > 0 && setShowDropdown(true)}
                      onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                    />
                    {phytoLoading && <p className="text-[10px] text-gray-400 mt-1">Recherche…</p>}
                    {showDropdown && phytoResults.length > 0 && (
                      <ul className="absolute z-20 w-full bg-white border border-gray-200 rounded shadow-md mt-1 max-h-40 overflow-y-auto">
                        {phytoResults.map(p => (
                          <li key={p.id}>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50"
                              onClick={() => selectProduct(p)}
                            >
                              <span className="font-medium text-gray-800">{p.nom_commercial}</span>
                              <span className="text-gray-400 ml-2">AMM {p.amm}</span>
                              {p.type_produit && <span className="text-gray-400 ml-1">· {p.type_produit}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <label className={lbl}>Numéro AMM (si non trouvé ci-dessus)</label>
                    <input type="text" className={inp} placeholder="ex : 2090111"
                      value={form.phyto_amm} onChange={e => set('phyto_amm', e.target.value)} />
                  </div>

                  <div>
                    <label className={lbl}>Cible (maladie / ravageur / adventice)</label>
                    {compatData.status === 'authorized' ? (
                      <select className={inp} value={form.phyto_cible} onChange={e => set('phyto_cible', e.target.value)}>
                        <option value="">— Sélectionner —</option>
                        {[...new Set(compatData.usages.map(u => u.nuisible).filter(Boolean))].sort().map(n => (
                          <option key={n!} value={n!}>{n}</option>
                        ))}
                      </select>
                    ) : (
                      <input type="text" className={inp} placeholder="ex : Septoriose, Pucerons"
                        value={form.phyto_cible} onChange={e => set('phyto_cible', e.target.value)} />
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className={lbl}>Dose</label>
                      <input type="number" className={inp} placeholder="0" min="0" step="0.01"
                        value={form.phyto_dose_value} onChange={e => set('phyto_dose_value', e.target.value)} />
                    </div>
                    <div>
                      <label className={lbl}>Unité</label>
                      <select className={inp} value={form.phyto_dose_unit} onChange={e => set('phyto_dose_unit', e.target.value)}>
                        <option>L/ha</option>
                        <option>kg/ha</option>
                        <option>g/ha</option>
                        <option>mL/ha</option>
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Vol. bouillie (L/ha)</label>
                      <input type="number" className={inp} placeholder="200" min="0"
                        value={form.phyto_volume_bouillie} onChange={e => set('phyto_volume_bouillie', e.target.value)} />
                    </div>
                  </div>

                  {/* ── Conformité e-phy ── */}
                  <CompatBlock
                    data={compatData}
                    culture={form.culture}
                    cible={form.phyto_cible}
                    doseValue={form.phyto_dose_value}
                    doseUnit={form.phyto_dose_unit}
                  />
                </div>
              )}

              {/* ── Fertilisation ── */}
              {cat === 'fertilisation' && (
                <div className="flex flex-col gap-3 pt-1">
                  <p className="text-xs font-medium text-gray-700 border-t border-gray-100 pt-3">Détails fertilisation</p>
                  <div className="relative">
                    <label className={lbl}>Rechercher un produit MFSC (nom ou AMM)</label>
                    <input
                      type="text"
                      className={inp}
                      placeholder="ex : Ammonitrate, 1170247…"
                      value={fertiSearch}
                      onChange={e => {
                        setFertiSearch(e.target.value)
                        if (!e.target.value) {
                          set('ferti_produit', '')
                          set('ferti_amm', '')
                          setFertiCompositionItems(null)
                          setFertiCompositionValues({})
                        }
                      }}
                      onFocus={() => fertiResults.length > 0 && setShowFertiDropdown(true)}
                      onBlur={() => setTimeout(() => setShowFertiDropdown(false), 150)}
                    />
                    {fertiLoading && <p className="text-[10px] text-gray-400 mt-1">Recherche…</p>}
                    {showFertiDropdown && fertiResults.length > 0 && (
                      <ul className="absolute z-20 w-full bg-white border border-gray-200 rounded shadow-md mt-1 max-h-40 overflow-y-auto">
                        {fertiResults.map(p => (
                          <li key={p.id}>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50"
                              onClick={() => selectFertiProduct(p)}
                            >
                              <span className="font-medium text-gray-800">{p.nom_produit}</span>
                              <span className="text-gray-400 ml-2">AMM {p.amm}</span>
                              {p.type_produit && <span className="text-gray-400 ml-1">· {p.type_produit}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={lbl}>Dose</label>
                      <input type="number" className={inp} placeholder="0" min="0" step="0.1"
                        value={form.ferti_dose_value} onChange={e => set('ferti_dose_value', e.target.value)} />
                    </div>
                    <div>
                      <label className={lbl}>Unité</label>
                      <select className={inp} value={form.ferti_dose_unit} onChange={e => set('ferti_dose_unit', e.target.value)}>
                        <option>kg/ha</option>
                        <option>L/ha</option>
                        <option>t/ha</option>
                        <option>U/ha</option>
                        <option>m³/ha</option>
                      </select>
                    </div>
                  </div>
                  <FertiCompatBlock
                    data={fertiCompatData}
                    culture={form.culture}
                    doseValue={form.ferti_dose_value}
                    doseUnit={form.ferti_dose_unit}
                  />
                  {fertiCompositionItems !== null && (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-medium text-gray-700 border-t border-gray-100 pt-3">Composition</p>
                      {fertiCompositionItems.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">Composition non renseignée dans e-phy</p>
                      ) : (
                        fertiCompositionItems.map(item => {
                          const rawVal = fertiCompositionValues[item.name]
                          const numVal = rawVal ? parseFloat(rawVal) : null
                          const outOfRange = numVal !== null && item.min !== null && item.max !== null
                            && (numVal < item.min || numVal > item.max)
                          return (
                            <div key={item.name} className="flex flex-col gap-0.5">
                              <label className={lbl}>{item.name}</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  className={`flex-1 ${outOfRange ? inpWarn : inp}`}
                                  placeholder="—"
                                  step="any"
                                  value={rawVal ?? ''}
                                  onChange={e => setFertiCompositionValues(prev => ({ ...prev, [item.name]: e.target.value }))}
                                />
                                {item.unit && <span className="text-xs text-gray-500 shrink-0">{item.unit}</span>}
                                {item.min !== null && item.max !== null && (
                                  <span className="text-[10px] text-gray-400 shrink-0 whitespace-nowrap">
                                    {item.min === item.max ? `= ${item.min}` : `${item.min} – ${item.max}`}
                                  </span>
                                )}
                              </div>
                              {outOfRange && (
                                <p className="text-[10px] text-orange-600">⚠ Hors fenêtre autorisée</p>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Semis ── */}
              {cat === 'semis' && (
                <div className="flex flex-col gap-3 pt-1">
                  <p className="text-xs font-medium text-gray-700 border-t border-gray-100 pt-3">Détails semis</p>
                  <div>
                    <label className={lbl}>Variété</label>
                    <input type="text" className={inp} placeholder="ex : Apache, Hybridus"
                      value={form.semis_variete} onChange={e => set('semis_variete', e.target.value)} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className={lbl}>Densité</label>
                      <input type="number" className={inp} placeholder="0" min="0" step="0.1"
                        value={form.semis_densite_value} onChange={e => set('semis_densite_value', e.target.value)} />
                    </div>
                    <div>
                      <label className={lbl}>Unité</label>
                      <select className={inp} value={form.semis_densite_unit} onChange={e => set('semis_densite_unit', e.target.value)}>
                        <option>kg/ha</option>
                        <option>grains/m²</option>
                        <option>plants/ha</option>
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Profondeur (cm)</label>
                      <input type="number" className={inp} placeholder="ex : 3" min="0" max="20" step="0.5"
                        value={form.semis_profondeur} onChange={e => set('semis_profondeur', e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Récolte ── */}
              {cat === 'recolte' && (
                <div className="flex flex-col gap-3 pt-1">
                  <p className="text-xs font-medium text-gray-700 border-t border-gray-100 pt-3">Détails récolte</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={lbl}>Rendement</label>
                      <input type="number" className={inp} placeholder="0" min="0" step="0.1"
                        value={form.recolte_rendement_value} onChange={e => set('recolte_rendement_value', e.target.value)} />
                    </div>
                    <div>
                      <label className={lbl}>Unité</label>
                      <select className={inp} value={form.recolte_rendement_unit} onChange={e => set('recolte_rendement_unit', e.target.value)}>
                        <option>t/ha</option>
                        <option>q/ha</option>
                        <option>kg/ha</option>
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Humidité récolte (%)</label>
                      <input type="number" className={inp} placeholder="ex : 14.5" min="0" max="100" step="0.1"
                        value={form.recolte_humidite} onChange={e => set('recolte_humidite', e.target.value)} />
                    </div>
                    <div>
                      <label className={lbl}>Destination</label>
                      <select className={inp} value={form.recolte_destination} onChange={e => set('recolte_destination', e.target.value)}>
                        <option value="">— Choisir —</option>
                        <option>Silo coopérative</option>
                        <option>Vente directe</option>
                        <option>Stockage à la ferme</option>
                        <option>Autoconsommation</option>
                        <option>Semences</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Irrigation ── */}
              {cat === 'irrigation' && (
                <div className="flex flex-col gap-3 pt-1">
                  <p className="text-xs font-medium text-gray-700 border-t border-gray-100 pt-3">Détails irrigation</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={lbl}>Volume (mm)</label>
                      <input type="number" className={inp} placeholder="ex : 30" min="0" step="0.1"
                        value={form.irrig_volume} onChange={e => set('irrig_volume', e.target.value)} />
                    </div>
                    <div>
                      <label className={lbl}>Durée (h)</label>
                      <input type="number" className={inp} placeholder="ex : 4" min="0" step="0.5"
                        value={form.irrig_duree} onChange={e => set('irrig_duree', e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Météo ── */}
              <div className="flex flex-col gap-2 pt-1 border-t border-gray-100">
                <div className="flex items-center justify-between pt-3">
                  <p className="text-xs font-medium text-gray-700">Conditions météo</p>
                  {(() => {
                    const dateInRange = !!currentWeather && currentWeather !== null &&
                      currentWeather.days.some(d => d.date === form.date)
                    const label = !currentWeather
                      ? 'Météo non chargée'
                      : !dateInRange
                      ? 'Date hors plage météo (J-2 / J+2)'
                      : 'Remplir depuis Open-Meteo'
                    return (
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.meteo_auto}
                          onChange={e => set('meteo_auto', e.target.checked)}
                          className="accent-gray-600"
                          disabled={!currentWeather || !dateInRange}
                        />
                        <span className="text-[10px] text-gray-500">{label}</span>
                      </label>
                    )
                  })()}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={lbl}>Temp. (°C)</label>
                    <input type="number" className={inp} placeholder="ex : 15" step="0.5"
                      value={form.meteo_temperature} onChange={e => set('meteo_temperature', e.target.value)}
                      readOnly={form.meteo_auto} />
                  </div>
                  <div>
                    <label className={lbl}>Vent (km/h)</label>
                    <input type="number" className={inp} placeholder="ex : 20" min="0" step="1"
                      value={form.meteo_vent_vitesse} onChange={e => set('meteo_vent_vitesse', e.target.value)}
                      readOnly={form.meteo_auto} />
                  </div>
                  <div>
                    <label className={lbl}>Humidité (%)</label>
                    <input type="number" className={inp} placeholder="ex : 70" min="0" max="100" step="1"
                      value={form.meteo_humidite} onChange={e => set('meteo_humidite', e.target.value)}
                      readOnly={form.meteo_auto} />
                  </div>
                </div>
                <div>
                  <label className={lbl}>Conditions générales</label>
                  <input type="text" className={inp} placeholder="ex : Vent modéré, ciel dégagé"
                    value={form.meteo_conditions} onChange={e => set('meteo_conditions', e.target.value)}
                    readOnly={form.meteo_auto} />
                </div>
              </div>

              {/* ── Commentaire ── */}
              <div>
                <label className={lbl}>Commentaire</label>
                <textarea
                  className={`${inp} resize-none`}
                  placeholder="Observations complémentaires…"
                  rows={3}
                  value={form.commentaire}
                  onChange={e => set('commentaire', e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0 bg-white">
          <button onClick={onClose} className="text-sm text-gray-500 hover:underline">Annuler</button>
          <button
            onClick={handleSave}
            disabled={!form.category || !form.date || saving}
            className="px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
