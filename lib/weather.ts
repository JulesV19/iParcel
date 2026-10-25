export interface DayWeather {
  date: string
  tempMax: number
  tempMin: number
  precipMm: number
  weatherCode: number
  windSpeedMax: number
}

export interface WeatherData {
  days: DayWeather[]
  todayIndex: number
  current: {
    temp: number
    apparentTemp: number
    humidity: number
    windKmh: number
    weatherCode: number
  }
}

const WMO_LABEL: Record<number, string> = {
  0: 'Ciel dégagé', 1: 'Peu nuageux', 2: 'Partiellement nuageux', 3: 'Couvert',
  45: 'Brouillard', 48: 'Brouillard givrant',
  51: 'Bruine légère', 53: 'Bruine modérée', 55: 'Bruine dense',
  61: 'Pluie légère', 63: 'Pluie modérée', 65: 'Pluie forte',
  71: 'Neige légère', 73: 'Neige modérée', 75: 'Neige forte', 77: 'Grains de neige',
  80: 'Averses légères', 81: 'Averses modérées', 82: 'Averses fortes',
  85: 'Averses de neige légères', 86: 'Averses de neige fortes',
  95: 'Orage', 96: 'Orage avec grêle', 99: 'Orage violent avec grêle',
}

export function weatherCodeLabel(code: number): string {
  return WMO_LABEL[code] ?? 'Conditions météo'
}

export function parcelCentroid(geometry: GeoJSON.Polygon): [number, number] {
  const ring = geometry.coordinates[0]
  const n = ring.length - 1 // skip closing duplicate
  if (n < 1) return [ring[0][1], ring[0][0]]
  const lon = ring.slice(0, n).reduce((s, c) => s + c[0], 0) / n
  const lat = ring.slice(0, n).reduce((s, c) => s + c[1], 0) / n
  return [lat, lon]
}

export async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  // J-2 → J+2 comptés dans le fuseau de la parcelle (timezone=auto), pas celui de l'appareil ou du serveur
  const params = new URLSearchParams({
    latitude: lat.toFixed(5),
    longitude: lon.toFixed(5),
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode,wind_speed_10m_max',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weathercode',
    past_days: '2',
    forecast_days: '3',
    timezone: 'auto',
  })

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)
  const json = await res.json()

  if (!Array.isArray(json.daily?.time) || !json.current) {
    throw new Error('Réponse Open-Meteo invalide')
  }

  const safeRound = (v: unknown): number => (typeof v === 'number' ? Math.round(v) : 0)
  const safePrecip = (v: unknown): number =>
    typeof v === 'number' ? Math.round(v * 10) / 10 : 0

  // Heure locale de la parcelle, au format AAAA-MM-JJTHH:MM
  const todayStr = typeof json.current.time === 'string' ? json.current.time.slice(0, 10) : ''
  const todayIndex = (json.daily.time as string[]).findIndex(d => d === todayStr)

  const days: DayWeather[] = (json.daily.time as string[]).map((date, i) => ({
    date,
    tempMax: safeRound(json.daily.temperature_2m_max[i]),
    tempMin: safeRound(json.daily.temperature_2m_min[i]),
    precipMm: safePrecip(json.daily.precipitation_sum[i]),
    weatherCode: safeRound(json.daily.weathercode[i]),
    windSpeedMax: safeRound(json.daily.wind_speed_10m_max[i]),
  }))

  return {
    days,
    todayIndex: todayIndex >= 0 ? todayIndex : 2,
    current: {
      temp: safeRound(json.current.temperature_2m),
      apparentTemp: safeRound(json.current.apparent_temperature),
      humidity: safeRound(json.current.relative_humidity_2m),
      windKmh: safeRound(json.current.wind_speed_10m),
      weatherCode: safeRound(json.current.weathercode),
    },
  }
}

export interface HistoryDay {
  date: string
  tempMax: number | null
  tempMin: number | null
  precipMm: number | null
  et0Mm: number | null
  weatherCode: number | null
  windSpeedMax: number | null
}

/**
 * Relevés journaliers passés (archive Open-Meteo, réanalyses), du start au end inclus, dans le
 * fuseau de la parcelle. Une valeur manquante reste null : pas de 0 qui fausserait un cumul.
 */
export async function fetchWeatherHistory(lat: number, lon: number, start: string, end: string): Promise<HistoryDay[]> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(5),
    longitude: lon.toFixed(5),
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration,weather_code,wind_speed_10m_max',
    start_date: start,
    end_date: end,
    timezone: 'auto',
  })
  const res = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`Open-Meteo archive ${res.status}`)
  const json = await res.json()
  const d = json.daily
  if (!Array.isArray(d?.time)) throw new Error('Réponse Open-Meteo invalide')

  const num = (series: unknown, i: number, digits: number): number | null => {
    const v = Array.isArray(series) ? series[i] : null
    return typeof v === 'number' && isFinite(v) ? Math.round(v * 10 ** digits) / 10 ** digits : null
  }
  return (d.time as string[]).map((date, i) => ({
    date,
    tempMax: num(d.temperature_2m_max, i, 1),
    tempMin: num(d.temperature_2m_min, i, 1),
    precipMm: num(d.precipitation_sum, i, 1),
    et0Mm: num(d.et0_fao_evapotranspiration, i, 1),
    weatherCode: num(d.weather_code, i, 0),
    windSpeedMax: num(d.wind_speed_10m_max, i, 0),
  }))
}
