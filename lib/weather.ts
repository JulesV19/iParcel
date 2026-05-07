export interface DayWeather {
  date: string
  tempMax: number
  tempMin: number
  precipMm: number
  weatherCode: number
}

export interface WeatherData {
  days: DayWeather[]
  todayIndex: number
  current: {
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

function localDateStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(5),
    longitude: lon.toFixed(5),
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode',
    current: 'apparent_temperature,relative_humidity_2m,wind_speed_10m,weathercode',
    past_days: '2',
    forecast_days: '3',
    timezone: 'auto',
  })

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)
  const json = await res.json()

  if (!Array.isArray(json.daily?.time) || !json.current) {
    throw new Error('Réponse Open-Meteo invalide')
  }

  const safeRound = (v: unknown): number => (typeof v === 'number' ? Math.round(v) : 0)
  const safePrecip = (v: unknown): number =>
    typeof v === 'number' ? Math.round(v * 10) / 10 : 0

  const todayStr = localDateStr()
  const todayIndex = (json.daily.time as string[]).findIndex(d => d === todayStr)

  const days: DayWeather[] = (json.daily.time as string[]).map((date, i) => ({
    date,
    tempMax: safeRound(json.daily.temperature_2m_max[i]),
    tempMin: safeRound(json.daily.temperature_2m_min[i]),
    precipMm: safePrecip(json.daily.precipitation_sum[i]),
    weatherCode: safeRound(json.daily.weathercode[i]),
  }))

  return {
    days,
    todayIndex: todayIndex >= 0 ? todayIndex : 2,
    current: {
      apparentTemp: safeRound(json.current.apparent_temperature),
      humidity: safeRound(json.current.relative_humidity_2m),
      windKmh: safeRound(json.current.wind_speed_10m),
      weatherCode: safeRound(json.current.weathercode),
    },
  }
}
