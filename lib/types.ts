export interface Parcel {
  id: string
  name: string
  geometry: GeoJSON.Polygon
}


export type InterventionCategory =
  | 'travail_sol'
  | 'semis'
  | 'fertilisation'
  | 'traitement_phyto'
  | 'irrigation'
  | 'recolte'
  | 'observation'
  | 'autre'

export interface ProduitPhyto {
  id: string
  amm: string
  nom_commercial: string
  titulaire: string | null
  type_produit: string | null
  statut: string | null
}

export interface ProduitMfsc {
  id: number
  amm: string
  nom_produit: string
  type_produit: string | null
  composition: string | null
}

export interface Intervention {
  id: string
  parcel_id: string
  category: InterventionCategory
  sub_type: string | null
  date: string
  culture: string | null
  stade_bbch: string | null
  operateur: string | null
  materiel: string | null
  surface_ha: number | null
  meteo_auto: boolean
  meteo_temperature: number | null
  meteo_vent_vitesse: number | null
  meteo_humidite: number | null
  meteo_conditions: string | null
  commentaire: string | null
  // Phyto
  phyto_produit_id: string | null
  phyto_produit_nom: string | null
  phyto_amm: string | null
  phyto_cible: string | null
  phyto_dose_value: number | null
  phyto_dose_unit: string | null
  phyto_volume_bouillie: number | null
  // Fertilisation
  ferti_produit: string | null
  ferti_amm: string | null
  ferti_dose_value: number | null
  ferti_dose_unit: string | null
  ferti_n_pct: number | null
  ferti_p_pct: number | null
  ferti_k_pct: number | null
  ferti_composition: Record<string, string> | null
  // Semis
  semis_variete: string | null
  semis_densite_value: number | null
  semis_densite_unit: string | null
  semis_profondeur_cm: number | null
  // Récolte
  recolte_rendement_value: number | null
  recolte_rendement_unit: string | null
  recolte_humidite_pct: number | null
  recolte_destination: string | null
  // Irrigation
  irrig_volume_mm: number | null
  irrig_duree_h: number | null
}
