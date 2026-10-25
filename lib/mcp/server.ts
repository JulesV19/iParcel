import { createHash } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { parcelAreaHa } from '@/lib/geo'
import { fetchWeather, fetchWeatherHistory, parcelCentroid, weatherCodeLabel } from '@/lib/weather'
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
// La licence Copernicus demande l'année des données
function sentinelSource(dates: string[]): string {
  const years = [...new Set(dates.map(d => d.slice(0, 4)))].sort().join(', ')
  return `Contient des données Copernicus Sentinel modifiées (${years}), via Element 84 Earth Search`
}
const WEATHER_SOURCE = 'Données météo : Open-Meteo.com (CC BY 4.0)'

// Le serveur ne télécharge des images que depuis le stockage officiel des COG Sentinel-2,
// quelle que soit l'adresse renvoyée par le catalogue STAC
const COG_ORIGIN = 'https://sentinel-cogs.s3.us-west-2.amazonaws.com'

function fromCogStorage(url: string): boolean {
  try { return new URL(url).origin === COG_ORIGIN } catch { return false }
}

// ─── Périodes ────────────────────────────────────────────────────────────────

// Archive Sentinel-2 complète sur la France à partir de 2018 ; même borne pour la météo
const MIN_DATE = '2018-01-01'
const MAX_PERIOD_DAYS = 366
const LIST_MAX_DATES = 60
const SERIES_MAX_DATES = 6
// Plan gratuit de Vercel : 1 vCPU ; les calculs attendent surtout le réseau
const SERIES_CONCURRENCY = 3
// La route est coupée à 90 s (app/api/mcp/route.ts) : on répond avant, même incomplet
const SERIES_DEADLINE_MS = 70_000
// À incrémenter quand lib/render.ts change le résultat d'un calcul : le cache est alors ignoré
const INDEX_ALGO_VERSION = 1

const DAY_MS = 86_400_000
const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const today = () => isoDay(new Date())
const yesterday = () => isoDay(new Date(Date.now() - DAY_MS))

function isDay(s: string): boolean {
  const d = new Date(`${s}T00:00:00Z`)
  return !isNaN(d.getTime()) && isoDay(d) === s
}

/** Période validée, ou message d'erreur destiné à l'IA. latest : dernier jour autorisé. */
function checkPeriod(start: string, end: string, latest: string): { start: string; end: string; days: number } | string {
  if (!isDay(start) || !isDay(end)) return 'Date invalide : format AAAA-MM-JJ attendu.'
  if (start < MIN_DATE) return `Les données disponibles commencent le ${MIN_DATE}.`
  if (end > latest) return `La période doit se terminer au plus tard le ${latest}.`
  if (start > end) return 'start_date doit précéder end_date.'
  const days = (Date.parse(end) - Date.parse(start)) / DAY_MS + 1
  if (days > MAX_PERIOD_DAYS) return `Période limitée à ${MAX_PERIOD_DAYS} jours par appel : découpez la demande.`
  return { start, end, days }
}

const parcelIdSchema = z.string().uuid().describe('Identifiant de la parcelle (voir list_parcels)')
const daySchema = (description: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe(description)
const indexSchema = z.enum(['NDVI', 'NDWI', 'NDMI']).describe('Indice à calculer')
const maxCloudSchema = z.number().min(0).max(100)

const PARCEL_NOT_FOUND = 'Parcelle introuvable. Utilisez list_parcels pour obtenir les identifiants.'
const HARMONIZATION_NOTE = 'Certaines dates de 2022 et du début de 2025 sont absentes : leurs valeurs radiométriques ne sont pas fiables (décalage non corrigé par le fournisseur).'

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

// ─── Calcul d'indice ─────────────────────────────────────────────────────────

type IndexType = z.infer<typeof indexSchema>

/** Résultat d'un calcul, tel qu'il est mis en cache */
interface IndexStats {
  mean: number | null
  std: number | null
  cloud_masked_pct: number
  bins: { from: number; to: number; pct: number }[]
}

const BIN_WIDTH = 2 / HIST_BINS

async function computeIndex(item: SentinelItem, geometry: GeoJSON.Polygon, index: IndexType, abort?: AbortSignal): Promise<IndexStats | null> {
  const raster = await rasterizeParcel(item, geometry, index, () => {}, () => false, true, abort)
  const stats = raster?.stats
  if (!stats) return null
  const total = stats.pixelCount + stats.maskedCount
  return {
    // null si la parcelle est entièrement masquée : aucune valeur fiable à cette date
    mean: stats.pixelCount ? round(stats.mean, 4) : null,
    std: stats.pixelCount ? round(stats.std, 4) : null,
    cloud_masked_pct: round(stats.maskedCount / total * 100, 1),
    bins: stats.histogram.map((n, i) => ({
      from: round(-1 + i * BIN_WIDTH, 2),
      to: round(-1 + (i + 1) * BIN_WIDTH, 2),
      pct: stats.pixelCount ? round(n / stats.pixelCount * 100, 2) : 0,
    })).filter(b => b.pct > 0),
  }
}

/** Jusqu'à n scènes réparties sur la période : la moins nuageuse de chaque intervalle, puis les moins nuageuses restantes. */
function spreadPicks(items: SentinelItem[], n: number, start: string, end: string): SentinelItem[] {
  const t0 = Date.parse(`${start}T00:00:00Z`)
  const span = Date.parse(`${end}T23:59:59Z`) - t0
  const cloud = (i: SentinelItem) => i.cloudCover ?? 100
  const picks = new Set<SentinelItem>()
  for (let b = 0; b < n; b++) {
    const inBucket = items.filter(i => Math.min(n - 1, Math.floor((Date.parse(i.date) - t0) / span * n)) === b)
    if (inBucket.length) picks.add(inBucket.reduce((a, c) => cloud(c) < cloud(a) ? c : a))
  }
  for (const i of [...items].sort((a, c) => cloud(a) - cloud(c))) {
    if (picks.size >= n) break
    picks.add(i)
  }
  return [...picks].sort((a, c) => a.date.localeCompare(c.date))
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }))
  return out
}

export function buildServer(token: string, userId: string): McpServer {
  const server = new McpServer({ name: 'iparcel', version: '1.1.0' })
  const db = userClient(token)

  type ReserveHeavy = (units: number) => Promise<ToolResult | null>

  // Chaque appel est tracé (supabase/mcp-audit.sql, mcp-budget.sql) ; journal injoignable = outil
  // non exécuté. weight : unités du quota général. Les calculs d'indice se réservent à part, une
  // fois connu le nombre de dates absentes du cache.
  async function audited(tool: string, parcelId: string | null, run: (reserveHeavy: ReserveHeavy) => Promise<ToolResult>, weight = 1): Promise<ToolResult> {
    const { data: callId, error } = await db.rpc('mcp_begin_call', { p_tool: tool, p_parcel_id: parcelId, p_weight: weight })
    if (error) {
      console.error('MCP audit :', error.code, error.message)
      return toolError('Service momentanément indisponible. Réessayez plus tard.')
    }
    if (callId === null) return toolError('Limite d’appels atteinte. Réessayez dans une minute (ou demain si la limite journalière est atteinte).')

    const reserveHeavy: ReserveHeavy = async units => {
      const { data, error } = await db.rpc('mcp_reserve_heavy', { p_id: callId, p_units: units })
      if (error) {
        console.error('MCP réservation :', error.code, error.message)
        return toolError('Service momentanément indisponible. Réessayez plus tard.')
      }
      if (data === 1) return toolError('Limite de calculs d’indices atteinte pour votre compte. Réessayez dans une minute, ou demain si la limite journalière est atteinte. Les résultats déjà calculés restent disponibles sans limite.')
      if (data === 2) return toolError('Limite journalière de calculs d’indices du service atteinte. Réessayez demain. Les résultats déjà calculés restent disponibles.')
      return null
    }

    // Temps CPU du processus : avec Fluid compute, d'autres requêtes peuvent partager l'instance,
    // la valeur est donc un majorant
    const cpu = process.cpuUsage()
    let result: ToolResult
    try {
      result = await run(reserveHeavy)
    } catch (e) {
      console.error(`MCP ${tool} :`, e)
      result = e instanceof Error && e.name === 'TimeoutError'
        ? toolError('Le service de données externe ne répond pas. Réessayez plus tard.')
        : toolError('Erreur inattendue pendant le traitement.')
    }
    const used = process.cpuUsage(cpu)
    const { error: endError } = await db.rpc('mcp_end_call', { p_id: callId, p_ok: !result.isError, p_cpu_ms: Math.round((used.user + used.system) / 1000) })
    if (endError) console.error('MCP audit (fin) :', endError.code, endError.message)
    return result
  }

  // Introuvable et appartenant à un autre compte donnent la même réponse
  async function loadParcel(id: string): Promise<{ id: string; name: string; geometry: GeoJSON.Polygon } | null> {
    const { data, error } = await db.from('parcels').select('id, name, geometry').eq('id', id).eq('user_id', userId).maybeSingle()
    if (error) throw new Error(`Lecture de la parcelle : ${error.code} ${error.message}`)
    return data ? { id: data.id, name: data.name, geometry: data.geometry as GeoJSON.Polygon } : null
  }

  // Cache des calculs (supabase/mcp-budget.sql) : indisponible = on recalcule, sans échec
  const inputHash = (geometry: GeoJSON.Polygon) =>
    createHash('sha256').update(`${INDEX_ALGO_VERSION}:${JSON.stringify(geometry)}`).digest('hex')

  async function cacheGet(parcelId: string, hash: string, index: IndexType, itemIds: string[]): Promise<Map<string, IndexStats>> {
    const { data, error } = await db.rpc('mcp_cache_get', { p_parcel_id: parcelId, p_input_hash: hash, p_index: index, p_item_ids: itemIds })
    if (error) {
      console.error('MCP cache (lecture) :', error.code, error.message)
      return new Map()
    }
    return new Map((data as { item_id: string; result: IndexStats }[]).map(r => [r.item_id, r.result]))
  }

  async function cachePut(parcelId: string, hash: string, index: IndexType, itemId: string, stats: IndexStats) {
    const { error } = await db.rpc('mcp_cache_put', { p_parcel_id: parcelId, p_input_hash: hash, p_index: index, p_item_id: itemId, p_result: stats })
    if (error) console.error('MCP cache (écriture) :', error.code, error.message)
  }

  server.registerTool('list_parcels', {
    title: 'Lister les parcelles',
    description: 'Liste les parcelles agricoles de l’utilisateur : identifiant, nom, surface en hectares et centroïde (latitude, longitude WGS84).',
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, () => audited('list_parcels', null, async () => {
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
  }, ({ parcel_id }) => audited('get_parcel', parcel_id, async () => {
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
    description: [
      'Météo au centroïde de la parcelle. Températures en °C, précipitations et évapotranspiration (ET0 FAO) en mm, vent en km/h ; dates dans le fuseau horaire local de la parcelle.',
      'Sans dates : conditions actuelles et relevés/prévisions journaliers de J-2 à J+2.',
      `Avec start_date (et end_date, hier par défaut) : relevés journaliers passés depuis le ${MIN_DATE}, ${MAX_PERIOD_DAYS} jours au plus par appel, avec les totaux de la période (cumul de pluie, ET0, température moyenne, somme de températures base 0 °C).`,
      'Les données passées viennent de réanalyses météo (maille d’une dizaine de kilomètres), pas d’une station sur la parcelle.',
    ].join(' '),
    inputSchema: {
      parcel_id: parcelIdSchema,
      start_date: daySchema(`Début de la période passée (AAAA-MM-JJ, à partir du ${MIN_DATE})`).optional(),
      end_date: daySchema('Fin de la période incluse (AAAA-MM-JJ), au plus tard hier ; hier par défaut').optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, ({ parcel_id, start_date, end_date }) => {
    if (start_date || end_date) {
      if (!start_date) return toolError('start_date est requis avec end_date.')
      const period = checkPeriod(start_date, end_date ?? yesterday(), yesterday())
      if (typeof period === 'string') return toolError(period)
      // Open-Meteo compte une requête de plus de 14 jours comme plusieurs appels
      return audited('get_weather', parcel_id, async () => {
        const parcel = await loadParcel(parcel_id)
        if (!parcel) return toolError(PARCEL_NOT_FOUND)
        const [lat, lon] = parcelCentroid(parcel.geometry)
        const days = await fetchWeatherHistory(lat, lon, period.start, period.end)
        const sum = (values: (number | null)[]) => round(values.reduce<number>((s, v) => s + (v ?? 0), 0), 1)
        const means = days.flatMap(d => d.tempMin !== null && d.tempMax !== null ? [(d.tempMin + d.tempMax) / 2] : [])
        return toolJson({
          parcel_id: parcel.id,
          period: { start: period.start, end: period.end },
          totals: {
            precipitation_mm: sum(days.map(d => d.precipMm)),
            et0_mm: sum(days.map(d => d.et0Mm)),
            temperature_mean_c: means.length ? round(means.reduce((s, v) => s + v, 0) / means.length, 1) : null,
            growing_degree_days_base0: round(means.reduce((s, v) => s + Math.max(0, v), 0), 0),
            days_with_missing_values: days.filter(d => d.tempMin === null || d.tempMax === null || d.precipMm === null).length,
          },
          days: days.map(d => ({
            date: d.date,
            temperature_min_c: d.tempMin,
            temperature_max_c: d.tempMax,
            precipitation_mm: d.precipMm,
            et0_mm: d.et0Mm,
            wind_max_kmh: d.windSpeedMax,
            conditions: d.weatherCode === null ? null : weatherCodeLabel(d.weatherCode),
          })),
          source: `${WEATHER_SOURCE}, archive historique (réanalyses)`,
        })
      }, Math.ceil(period.days / 14))
    }

    return audited('get_weather', parcel_id, async () => {
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
    })
  })

  server.registerTool('list_satellite_images', {
    title: 'Images satellite disponibles',
    description: [
      'Liste les dates d’acquisition Sentinel-2 couvrant la parcelle, de la plus récente à la plus ancienne.',
      `Sans période : les 12 dernières dates. Avec start_date (et end_date, aujourd’hui par défaut) : les dates de la période, depuis le ${MIN_DATE}, ${MAX_PERIOD_DAYS} jours au plus par appel, ${LIST_MAX_DATES} dates au plus (utilisez max_cloud_pct pour ne garder que les images peu nuageuses).`,
      'Attention : les pourcentages (nuages, ombres, végétation, eau, neige, absence de données) portent sur toute la tuile Sentinel-2 d’environ 110 km de côté, pas sur la parcelle ; get_vegetation_index donne la part de la parcelle réellement masquée par les nuages.',
      HARMONIZATION_NOTE,
    ].join(' '),
    inputSchema: {
      parcel_id: parcelIdSchema,
      start_date: daySchema(`Début de période (AAAA-MM-JJ, à partir du ${MIN_DATE})`).optional(),
      end_date: daySchema('Fin de période incluse (AAAA-MM-JJ), aujourd’hui par défaut').optional(),
      max_cloud_pct: maxCloudSchema.optional().describe('Couverture nuageuse maximale de la tuile, en %'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, ({ parcel_id, start_date, end_date, max_cloud_pct }) => {
    let period: { start: string; end: string } | null = null
    if (start_date || end_date) {
      if (!start_date) return toolError('start_date est requis avec end_date.')
      const checked = checkPeriod(start_date, end_date ?? today(), today())
      if (typeof checked === 'string') return toolError(checked)
      period = checked
    }
    return audited('list_satellite_images', parcel_id, async () => {
      const parcel = await loadParcel(parcel_id)
      if (!parcel) return toolError(PARCEL_NOT_FOUND)
      const items = await fetchSentinelDates(parcel.geometry, period
        ? { start: period.start, end: period.end, maxCloud: max_cloud_pct, max: LIST_MAX_DATES + 1 }
        : { maxCloud: max_cloud_pct })
      const shown = items.slice(0, LIST_MAX_DATES)
      return toolJson({
        parcel_id: parcel.id,
        ...(period && { period: { start: period.start, end: period.end } }),
        images: shown.map(imageSummary),
        // Plus de dates que la limite : les plus récentes sont renvoyées
        ...(items.length > LIST_MAX_DATES && { truncated: true }),
        source: sentinelSource(shown.map(i => i.date)),
      })
    })
  })

  server.registerTool('get_vegetation_index', {
    title: 'Indice spectral d’une parcelle',
    description: [
      'Calcule un indice spectral sur la parcelle pour une date Sentinel-2 (voir list_satellite_images), à partir des bandes à 10–20 m rééchantillonnées sur une grille d’environ 2,5 m.',
      'Les pixels de nuages, ombres de nuages, cirrus et neige sont exclus grâce à la classification de scène Sentinel-2 (SCL) ; cloud_masked_pct indique la part de la parcelle exclue.',
      'NDVI (vigueur de la végétation) : < 0,2 sol nu ou très peu couvert, 0,2–0,5 couvert modéré, > 0,5 végétation dense et active.',
      'NDWI (eau libre) : valeurs positives = eau (mares, fossés, zones inondées).',
      'NDMI (humidité des plantes) : valeurs basses = manque d’eau dans la végétation.',
      'Calcul coûteux : quota plus strict que les autres outils. Un résultat déjà calculé dans les 90 derniers jours est réutilisé sans compter. Pour suivre une évolution, préférez get_vegetation_series.',
    ].join(' '),
    inputSchema: {
      parcel_id: parcelIdSchema,
      date: daySchema('Date d’acquisition au format AAAA-MM-JJ, parmi celles de list_satellite_images'),
      index: indexSchema,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, ({ parcel_id, date, index }) => {
    if (!isDay(date) || date < MIN_DATE || date > today()) return toolError(`Date invalide : choisissez une date entre le ${MIN_DATE} et aujourd’hui, parmi celles de list_satellite_images.`)
    return audited('get_vegetation_index', parcel_id, async reserveHeavy => {
      const parcel = await loadParcel(parcel_id)
      if (!parcel) return toolError(PARCEL_NOT_FOUND)
      const [item] = await fetchSentinelDates(parcel.geometry, { start: date, max: 1 })
      if (!item) return toolError('Aucune image Sentinel-2 exploitable à cette date. Utilisez list_satellite_images.')

      const secUrl = index === 'NDVI' ? item.redUrl : index === 'NDWI' ? item.greenUrl : item.swirUrl
      if (![item.nirUrl, secUrl, item.sclUrl].every(fromCogStorage)) {
        console.error('MCP get_vegetation_index : adresse d’image hors du stockage Sentinel', item.date)
        return toolError('Image indisponible pour cette date.')
      }

      const hash = inputHash(parcel.geometry)
      let stats = (await cacheGet(parcel.id, hash, index, [item.id])).get(item.id) ?? null
      if (!stats) {
        const refused = await reserveHeavy(1)
        if (refused) return refused
        stats = await computeIndex(item, parcel.geometry, index)
        if (!stats) return toolError('Calcul impossible pour cette date.')
        await cachePut(parcel.id, hash, index, item.id, stats)
      }
      return toolJson({
        parcel_id: parcel.id,
        date,
        acquired_at: item.date,
        index,
        index_name: INDEX_INFO[index].name,
        mean: stats.mean,
        std: stats.std,
        cloud_masked_pct: stats.cloud_masked_pct,
        histogram: { range: [-1, 1], bin_width: BIN_WIDTH, bins: stats.bins },
        source: sentinelSource([item.date]),
      })
    })
  })

  server.registerTool('get_vegetation_series', {
    title: 'Évolution d’un indice spectral',
    description: [
      `Évolution d’un indice spectral (NDVI, NDWI ou NDMI, voir get_vegetation_index) sur une période : jusqu’à ${SERIES_MAX_DATES} dates Sentinel-2 réparties sur la période, chacune étant la moins nuageuse de son intervalle (couverture de la tuile ≤ max_cloud_pct).`,
      'Pour chaque date : moyenne, écart-type et part de la parcelle masquée par les nuages (mean est null si la parcelle est entièrement masquée).',
      `Période depuis le ${MIN_DATE}, ${MAX_PERIOD_DAYS} jours au plus. Chaque date calculée compte dans le quota de calculs d’indices ; les résultats déjà calculés dans les 90 derniers jours sont réutilisés sans compter.`,
      HARMONIZATION_NOTE,
    ].join(' '),
    inputSchema: {
      parcel_id: parcelIdSchema,
      index: indexSchema,
      start_date: daySchema(`Début de période (AAAA-MM-JJ, à partir du ${MIN_DATE})`),
      end_date: daySchema('Fin de période incluse (AAAA-MM-JJ)'),
      max_cloud_pct: maxCloudSchema.default(30).describe('Couverture nuageuse maximale de la tuile, en % (30 par défaut)'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, ({ parcel_id, index, start_date, end_date, max_cloud_pct }) => {
    const period = checkPeriod(start_date, end_date, today())
    if (typeof period === 'string') return toolError(period)
    return audited('get_vegetation_series', parcel_id, async reserveHeavy => {
      const parcel = await loadParcel(parcel_id)
      if (!parcel) return toolError(PARCEL_NOT_FOUND)
      const candidates = await fetchSentinelDates(parcel.geometry, { start: period.start, end: period.end, maxCloud: max_cloud_pct, max: 400 })
      const picks = spreadPicks(candidates, SERIES_MAX_DATES, period.start, period.end).filter(item => {
        const secUrl = index === 'NDVI' ? item.redUrl : index === 'NDWI' ? item.greenUrl : item.swirUrl
        return [item.nirUrl, secUrl, item.sclUrl].every(fromCogStorage)
      })
      if (!picks.length) return toolError(`Aucune image Sentinel-2 exploitable sur cette période avec moins de ${max_cloud_pct} % de nuages. Élargissez la période ou augmentez max_cloud_pct.`)

      const hash = inputHash(parcel.geometry)
      const cached = await cacheGet(parcel.id, hash, index, picks.map(i => i.id))
      const missing = picks.filter(i => !cached.has(i.id))
      if (missing.length) {
        const refused = await reserveHeavy(missing.length)
        if (refused) return refused
      }

      const deadline = AbortSignal.timeout(SERIES_DEADLINE_MS)
      const computed = new Map<string, IndexStats | 'error' | 'timeout'>()
      await mapLimit(missing, SERIES_CONCURRENCY, async item => {
        try {
          const stats = await computeIndex(item, parcel.geometry, index, deadline)
          computed.set(item.id, stats ?? 'error')
          if (stats) await cachePut(parcel.id, hash, index, item.id, stats)
        } catch (e) {
          if (!deadline.aborted) console.error('MCP get_vegetation_series :', item.id, e)
          computed.set(item.id, deadline.aborted ? 'timeout' : 'error')
        }
      })

      return toolJson({
        parcel_id: parcel.id,
        index,
        index_name: INDEX_INFO[index].name,
        period: { start: period.start, end: period.end },
        max_cloud_pct,
        available_dates: candidates.length,
        points: picks.map(item => {
          const base = { date: item.date.slice(0, 10), acquired_at: item.date, tile_cloud_cover_pct: item.cloudCover }
          const stats = cached.get(item.id) ?? computed.get(item.id)
          if (stats === 'timeout') return { ...base, error: 'Délai dépassé : relancez l’appel, les dates déjà calculées seront réutilisées.' }
          if (!stats || stats === 'error') return { ...base, error: 'Calcul impossible pour cette date.' }
          return { ...base, mean: stats.mean, std: stats.std, cloud_masked_pct: stats.cloud_masked_pct }
        }),
        source: sentinelSource(picks.map(i => i.date)),
      })
    })
  })

  return server
}
