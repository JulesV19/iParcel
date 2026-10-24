import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { parcelAreaHa } from '@/lib/geo'
import { fetchWeather, parcelCentroid, weatherCodeLabel } from '@/lib/weather'
import { fetchSentinelDates, type SentinelItem } from '@/lib/stac'
import { HIST_BINS, INDEX_INFO, rasterizeParcel } from '@/lib/render'

// Client Supabase propre à la requête, porteur du jeton de l'utilisateur : la RLS s'applique
function userClient(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits

type ToolResult = { isError?: boolean; content: { type: 'text'; text: string }[] }

function toolError(text: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text }] }
}

function toolJson(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] }
}

// Mentions exigées par les licences des données, à reprendre dans les rapports
const SENTINEL_SOURCE = 'Contient des données Copernicus Sentinel-2 modifiées (ESA), via Element 84 Earth Search'
const WEATHER_SOURCE = 'Données météo : Open-Meteo.com (CC BY 4.0)'

// Le serveur ne télécharge des images que depuis le stockage officiel des COG Sentinel-2,
// quelle que soit l'adresse renvoyée par le catalogue STAC
const COG_ORIGIN = 'https://sentinel-cogs.s3.us-west-2.amazonaws.com'

function fromCogStorage(url: string): boolean {
  try { return new URL(url).origin === COG_ORIGIN } catch { return false }
}

const parcelIdSchema = z.string().uuid().describe('Identifiant de la parcelle (voir list_parcels)')

const PARCEL_NOT_FOUND = 'Parcelle introuvable. Utilisez list_parcels pour obtenir les identifiants.'

function bbox(geometry: GeoJSON.Polygon) {
  const ring = geometry.coordinates[0]
  const lons = ring.map(c => c[0])
  const lats = ring.map(c => c[1])
  return { west: Math.min(...lons), south: Math.min(...lats), east: Math.max(...lons), north: Math.max(...lats) }
}

function imageSummary(item: SentinelItem) {
  return {
    date: item.date.slice(0, 10),
    acquired_at: item.date,
    platform: item.platform,
    cloud_cover_pct: item.cloudCover,
    cloud_shadow_pct: item.cloudShadow,
    vegetation_pct: item.vegetation,
    water_pct: item.water,
    snow_pct: item.snow,
    nodata_pct: item.nodata,
    sun_elevation_deg: item.sunElevation,
  }
}

export function buildServer(token: string, userId: string): McpServer {
  const server = new McpServer({ name: 'iparcel', version: '1.0.0' })
  const db = userClient(token)

  // Chaque appel est tracé (supabase/mcp-audit.sql) ; journal injoignable = outil non exécuté
  async function audited(tool: string, parcelId: string | null, heavy: boolean, run: () => Promise<ToolResult>): Promise<ToolResult> {
    const { data: callId, error } = await db.rpc('mcp_begin_call', { p_tool: tool, p_parcel_id: parcelId, p_heavy: heavy })
    if (error) {
      console.error('MCP audit :', error.code, error.message)
      return toolError('Service momentanément indisponible. Réessayez plus tard.')
    }
    if (callId === null) return toolError('Limite d’appels atteinte. Réessayez dans une minute (ou demain si la limite journalière est atteinte).')
    let result: ToolResult
    try {
      result = await run()
    } catch (e) {
      console.error(`MCP ${tool} :`, e)
      result = e instanceof Error && e.name === 'TimeoutError'
        ? toolError('Le service de données externe ne répond pas. Réessayez plus tard.')
        : toolError('Erreur inattendue pendant le traitement.')
    }
    const { error: endError } = await db.rpc('mcp_end_call', { p_id: callId, p_ok: !result.isError })
    if (endError) console.error('MCP audit (fin) :', endError.code, endError.message)
    return result
  }

  // Introuvable et appartenant à un autre compte donnent la même réponse
  async function loadParcel(id: string): Promise<{ id: string; name: string; geometry: GeoJSON.Polygon } | null> {
    const { data, error } = await db.from('parcels').select('id, name, geometry').eq('id', id).eq('user_id', userId).maybeSingle()
    if (error) throw new Error(`Lecture de la parcelle : ${error.code} ${error.message}`)
    return data ? { id: data.id, name: data.name, geometry: data.geometry as GeoJSON.Polygon } : null
  }

  server.registerTool('list_parcels', {
    title: 'Lister les parcelles',
    description: 'Liste les parcelles agricoles de l’utilisateur : identifiant, nom, surface en hectares et centroïde (latitude, longitude WGS84).',
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, () => audited('list_parcels', null, false, async () => {
    const { data, error } = await db.from('parcels').select('id, name, geometry').eq('user_id', userId)
    if (error) {
      console.error('MCP list_parcels :', error.code, error.message)
      return toolError('Impossible de lire les parcelles pour le moment.')
    }
    const parcels = data.map(p => {
      const geometry = p.geometry as GeoJSON.Polygon
      const [lat, lon] = parcelCentroid(geometry)
      return { id: p.id, name: p.name, area_ha: round(parcelAreaHa(geometry), 2), centroid: { lat: round(lat, 5), lon: round(lon, 5) } }
    })
    return toolJson({ parcels })
  }))

  server.registerTool('get_parcel', {
    title: 'Fiche d’une parcelle',
    description: 'Détail d’une parcelle : nom, surface en hectares, centroïde, emprise (bbox) et contour GeoJSON (Polygon, coordonnées [longitude, latitude] WGS84).',
    inputSchema: { parcel_id: parcelIdSchema },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, ({ parcel_id }) => audited('get_parcel', parcel_id, false, async () => {
    const parcel = await loadParcel(parcel_id)
    if (!parcel) return toolError(PARCEL_NOT_FOUND)
    const [lat, lon] = parcelCentroid(parcel.geometry)
    return toolJson({
      id: parcel.id,
      name: parcel.name,
      area_ha: round(parcelAreaHa(parcel.geometry), 2),
      centroid: { lat: round(lat, 5), lon: round(lon, 5) },
      bbox: bbox(parcel.geometry),
      geometry: parcel.geometry,
    })
  }))

  server.registerTool('get_weather', {
    title: 'Météo d’une parcelle',
    description: 'Météo au centroïde de la parcelle : conditions actuelles et relevés/prévisions journaliers de J-2 à J+2 (températures en °C, précipitations en mm, vent en km/h). Les dates sont dans le fuseau horaire local de la parcelle.',
    inputSchema: { parcel_id: parcelIdSchema },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, ({ parcel_id }) => audited('get_weather', parcel_id, false, async () => {
    const parcel = await loadParcel(parcel_id)
    if (!parcel) return toolError(PARCEL_NOT_FOUND)
    const [lat, lon] = parcelCentroid(parcel.geometry)
    const weather = await fetchWeather(lat, lon)
    return toolJson({
      parcel_id: parcel.id,
      current: {
        temperature_c: weather.current.temp,
        apparent_temperature_c: weather.current.apparentTemp,
        humidity_pct: weather.current.humidity,
        wind_kmh: weather.current.windKmh,
        conditions: weatherCodeLabel(weather.current.weatherCode),
      },
      days: weather.days.map((d, i) => ({
        date: d.date,
        kind: i < weather.todayIndex ? 'observed' : i === weather.todayIndex ? 'today' : 'forecast',
        temperature_min_c: d.tempMin,
        temperature_max_c: d.tempMax,
        precipitation_mm: d.precipMm,
        wind_max_kmh: d.windSpeedMax,
        conditions: weatherCodeLabel(d.weatherCode),
      })),
      source: WEATHER_SOURCE,
    })
  }))

  server.registerTool('list_satellite_images', {
    title: 'Images satellite disponibles',
    description: 'Liste les 12 dernières dates d’acquisition Sentinel-2 couvrant la parcelle, de la plus récente à la plus ancienne. Attention : les pourcentages (nuages, ombres, végétation, eau, neige, absence de données) portent sur toute la tuile Sentinel-2 d’environ 110 km de côté, pas sur la parcelle ; get_vegetation_index donne la part de la parcelle réellement masquée par les nuages.',
    inputSchema: { parcel_id: parcelIdSchema },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, ({ parcel_id }) => audited('list_satellite_images', parcel_id, false, async () => {
    const parcel = await loadParcel(parcel_id)
    if (!parcel) return toolError(PARCEL_NOT_FOUND)
    const items = await fetchSentinelDates(parcel.geometry)
    return toolJson({ parcel_id: parcel.id, images: items.map(imageSummary), source: SENTINEL_SOURCE })
  }))

  server.registerTool('get_vegetation_index', {
    title: 'Indice spectral d’une parcelle',
    description: [
      'Calcule un indice spectral sur la parcelle pour une date Sentinel-2 (voir list_satellite_images), à partir des bandes à 10–20 m rééchantillonnées sur une grille d’environ 2,5 m.',
      'Les pixels de nuages, ombres de nuages, cirrus et neige sont exclus grâce à la classification de scène Sentinel-2 (SCL) ; cloud_masked_pct indique la part de la parcelle exclue.',
      'NDVI (vigueur de la végétation) : < 0,2 sol nu ou très peu couvert, 0,2–0,5 couvert modéré, > 0,5 végétation dense et active.',
      'NDWI (eau libre) : valeurs positives = eau (mares, fossés, zones inondées).',
      'NDMI (humidité des plantes) : valeurs basses = manque d’eau dans la végétation.',
      'Calcul coûteux : quota plus strict que les autres outils.',
    ].join(' '),
    inputSchema: {
      parcel_id: parcelIdSchema,
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Date d’acquisition au format AAAA-MM-JJ, parmi celles de list_satellite_images'),
      index: z.enum(['NDVI', 'NDWI', 'NDMI']).describe('Indice à calculer'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, ({ parcel_id, date, index }) => audited('get_vegetation_index', parcel_id, true, async () => {
    const parcel = await loadParcel(parcel_id)
    if (!parcel) return toolError(PARCEL_NOT_FOUND)
    const item = (await fetchSentinelDates(parcel.geometry)).find(i => i.date.slice(0, 10) === date)
    if (!item) return toolError('Aucune image Sentinel-2 à cette date parmi les 12 dernières. Utilisez list_satellite_images.')

    const secUrl = index === 'NDVI' ? item.redUrl : index === 'NDWI' ? item.greenUrl : item.swirUrl
    if (![item.nirUrl, secUrl, item.sclUrl].every(fromCogStorage)) {
      console.error('MCP get_vegetation_index : adresse d’image hors du stockage Sentinel', item.date)
      return toolError('Image indisponible pour cette date.')
    }

    const raster = await rasterizeParcel(item, parcel.geometry, index, () => {}, () => false, true)
    const stats = raster?.stats
    if (!stats) return toolError('Calcul impossible pour cette date.')
    const total = stats.pixelCount + stats.maskedCount
    const binWidth = 2 / HIST_BINS
    return toolJson({
      parcel_id: parcel.id,
      date,
      acquired_at: item.date,
      index,
      index_name: INDEX_INFO[index].name,
      // null si la parcelle est entièrement masquée : aucune valeur fiable à cette date
      mean: stats.pixelCount ? round(stats.mean, 4) : null,
      std: stats.pixelCount ? round(stats.std, 4) : null,
      cloud_masked_pct: round(stats.maskedCount / total * 100, 1),
      histogram: {
        range: [-1, 1],
        bin_width: binWidth,
        bins: stats.histogram.map((n, i) => ({
          from: round(-1 + i * binWidth, 2),
          to: round(-1 + (i + 1) * binWidth, 2),
          pct: stats.pixelCount ? round(n / stats.pixelCount * 100, 2) : 0,
        })).filter(b => b.pct > 0),
      },
      source: SENTINEL_SOURCE,
    })
  }))

  return server
}
