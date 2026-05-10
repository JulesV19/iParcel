export interface Parcel {
  id: string
  name: string
  geometry: GeoJSON.Polygon
}

export interface Note {
  id: string
  parcel_id: string
  content: string
  date: string // YYYY-MM-DD
}
