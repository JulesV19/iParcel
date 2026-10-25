import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { USER_ID, json, jwks, mockFetch, signToken, stubEnv, type FetchCall } from './helpers'

let route: typeof import('@/app/api/mcp/route')
let wellKnown: typeof import('@/app/.well-known/oauth-protected-resource/[[...path]]/route')

beforeAll(async () => {
  stubEnv()
  route = await import('@/app/api/mcp/route')
  wellKnown = await import('@/app/.well-known/oauth-protected-resource/[[...path]]/route')
})

const MCP_URL = 'https://i-parcel.vercel.app/api/mcp'
const PARCEL = {
  id: '66666666-6666-4666-8666-666666666666',
  name: 'Champ du haut',
  geometry: { type: 'Polygon', coordinates: [[[2.35, 48.85], [2.36, 48.85], [2.36, 48.86], [2.35, 48.86], [2.35, 48.85]]] },
}

let beginCall: () => Response
let calls: FetchCall[]

beforeEach(() => {
  beginCall = () => json(42)
  calls = mockFetch({
    '/auth/v1/.well-known/jwks.json': async () => json(await jwks()),
    '/rest/v1/rpc/oauth_grant_active': () => json(true),
    '/rest/v1/rpc/mcp_begin_call': () => beginCall(),
    '/rest/v1/rpc/mcp_end_call': () => new Response(null, { status: 204 }),
    '/rest/v1/parcels': () => json([PARCEL]),
  })
})

async function rpc(method: string, params: unknown, token?: string) {
  const res = await route.POST(new Request(MCP_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }))
  return { res, body: res.headers.get('content-type')?.includes('json') ? await res.json() : null }
}

const callTool = async (name: string, args: Record<string, unknown>) => rpc('tools/call', { name, arguments: args }, await signToken())

describe('route /api/mcp', () => {
  it('sans jeton : 401 avec l’adresse des métadonnées OAuth', async () => {
    const { res } = await rpc('tools/list', {})
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toBe('Bearer resource_metadata="https://i-parcel.vercel.app/.well-known/oauth-protected-resource/api/mcp"')
    expect(res.headers.get('access-control-expose-headers')).toContain('WWW-Authenticate')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('Supabase injoignable : 503 avec Retry-After', async () => {
    mockFetch({
      '/auth/v1/.well-known/jwks.json': async () => json(await jwks()),
      '/rest/v1/rpc/oauth_grant_active': () => { throw new TypeError('fetch failed') },
    })
    const { res } = await rpc('tools/list', {}, await signToken())
    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('30')
  })

  it('GET et DELETE : 405 (pas de session ni de flux)', async () => {
    expect(route.GET().status).toBe(405)
    expect(route.DELETE().status).toBe(405)
  })

  it('OPTIONS : préflight CORS', () => {
    const res = route.OPTIONS()
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-headers')).toContain('Authorization')
  })

  it('liste les 6 outils, tous en lecture seule', async () => {
    const { res, body } = await rpc('tools/list', {}, await signToken())
    expect(res.status).toBe(200)
    const tools = body.result.tools as { name: string; annotations?: { readOnlyHint?: boolean } }[]
    expect(tools.map(t => t.name).sort()).toEqual(['get_parcel', 'get_vegetation_index', 'get_vegetation_series', 'get_weather', 'list_parcels', 'list_satellite_images'])
    expect(tools.every(t => t.annotations?.readOnlyHint === true)).toBe(true)
  })
})

describe('outils', () => {
  it('list_parcels : lit avec le jeton de l’utilisateur et trace l’appel', async () => {
    const token = await signToken()
    const { body } = await rpc('tools/call', { name: 'list_parcels', arguments: {} }, token)
    expect(body.result.isError).toBeUndefined()
    const data = JSON.parse(body.result.content[0].text)
    expect(data.parcels).toEqual([{ id: PARCEL.id, name: PARCEL.name, area_ha: expect.any(Number), centroid: { lat: expect.any(Number), lon: expect.any(Number) } }])

    const read = calls.find(c => new URL(c.url).pathname === '/rest/v1/parcels')!
    expect(read.headers.get('authorization')).toBe(`Bearer ${token}`)
    expect(new URL(read.url).searchParams.get('user_id')).toBe(`eq.${USER_ID}`)

    const begin = calls.find(c => c.url.endsWith('/rpc/mcp_begin_call'))!
    expect(JSON.parse(begin.body)).toEqual({ p_tool: 'list_parcels', p_parcel_id: null, p_weight: 1 })
    const end = calls.find(c => c.url.endsWith('/rpc/mcp_end_call'))!
    expect(JSON.parse(end.body)).toEqual({ p_id: 42, p_ok: true, p_cpu_ms: expect.any(Number) })
  })

  it('aucune requête n’écrit dans la table des parcelles', async () => {
    await callTool('list_parcels', {})
    await callTool('get_parcel', { parcel_id: PARCEL.id })
    const writes = calls.filter(c => new URL(c.url).pathname === '/rest/v1/parcels' && c.method !== 'GET')
    expect(writes).toEqual([])
  })

  it('quota atteint : outil non exécuté', async () => {
    beginCall = () => json(null)
    const { body } = await callTool('get_parcel', { parcel_id: PARCEL.id })
    expect(body.result.isError).toBe(true)
    expect(body.result.content[0].text).toContain('Limite d’appels atteinte')
    expect(calls.some(c => new URL(c.url).pathname === '/rest/v1/parcels')).toBe(false)
  })

  it('journal injoignable : outil non exécuté', async () => {
    beginCall = () => json({ code: '42501', message: 'Accès retiré par l’utilisateur.' }, 403)
    const { body } = await callTool('list_parcels', {})
    expect(body.result.isError).toBe(true)
    expect(calls.some(c => new URL(c.url).pathname === '/rest/v1/parcels')).toBe(false)
  })

  it('parcelle d’un autre compte ou inexistante : même réponse « introuvable »', async () => {
    mockFetch({
      '/auth/v1/.well-known/jwks.json': async () => json(await jwks()),
      '/rest/v1/rpc/oauth_grant_active': () => json(true),
      '/rest/v1/rpc/mcp_begin_call': () => json(7),
      '/rest/v1/rpc/mcp_end_call': () => new Response(null, { status: 204 }),
      '/rest/v1/parcels': () => json([]),
    })
    const { body } = await callTool('get_parcel', { parcel_id: PARCEL.id })
    expect(body.result.isError).toBe(true)
    expect(body.result.content[0].text).toMatch(/^Parcelle introuvable/)
  })

  it.each([
    ['identifiant non UUID', 'get_parcel', { parcel_id: '../../etc/passwd' }],
    ['date mal formée', 'get_vegetation_index', { parcel_id: PARCEL.id, date: '2026-10-04T00:00:00Z', index: 'NDVI' }],
    ['indice inconnu', 'get_vegetation_index', { parcel_id: PARCEL.id, date: '2026-10-04', index: 'EVI' }],
    ['date d’indice avant 2018', 'get_vegetation_index', { parcel_id: PARCEL.id, date: '2017-06-01', index: 'NDVI' }],
    ['série de plus de 366 jours', 'get_vegetation_series', { parcel_id: PARCEL.id, index: 'NDVI', start_date: '2024-01-01', end_date: '2025-06-30' }],
    ['série à l’envers', 'get_vegetation_series', { parcel_id: PARCEL.id, index: 'NDVI', start_date: '2025-06-30', end_date: '2025-01-01' }],
    ['météo passée avant 2018', 'get_weather', { parcel_id: PARCEL.id, start_date: '2017-12-01', end_date: '2018-01-31' }],
    ['météo passée jusqu’à demain', 'get_weather', { parcel_id: PARCEL.id, start_date: '2026-01-01', end_date: '2099-01-01' }],
    ['fin de période sans début', 'list_satellite_images', { parcel_id: PARCEL.id, end_date: '2025-06-30' }],
    ['date impossible', 'list_satellite_images', { parcel_id: PARCEL.id, start_date: '2025-02-30' }],
  ])('paramètres refusés avant tout accès aux données : %s', async (_, name, args) => {
    const { body } = await callTool(name, args)
    expect(body.result?.isError === true || body.error !== undefined).toBe(true)
    expect(calls.filter(c => !c.url.endsWith('/rpc/oauth_grant_active') && c.url.includes('/rest/v1/'))).toEqual([])
  })
})

// Scène Sentinel-2 telle que la renvoie Earth Search (champs filtrés par lib/stac.ts)
function scene(day: string, cloud: number, harmonized = true) {
  const cog = (band: string) => ({ href: `https://sentinel-cogs.s3.us-west-2.amazonaws.com/31UCP/${day}/${band}.tif` })
  return {
    id: `S2B_31UCP_${day.replaceAll('-', '')}_0_L2A`,
    bbox: [1, 48, 2, 49],
    properties: {
      datetime: `${day}T10:56:00Z`,
      platform: 'sentinel-2b',
      'eo:cloud_cover': cloud,
      's2:processing_baseline': '05.11',
      'earthsearch:boa_offset_applied': harmonized,
    },
    assets: Object.fromEntries(['thumbnail', 'visual', 'red', 'nir', 'green', 'swir16', 'scl'].map(b => [b, cog(b)])),
  }
}

const CACHED = { mean: 0.61, std: 0.05, cloud_masked_pct: 0, bins: [{ from: 0.6, to: 0.65, pct: 100 }] }

function mockData(extra: Record<string, (call: FetchCall) => Response> = {}) {
  calls = mockFetch({
    '/auth/v1/.well-known/jwks.json': async () => json(await jwks()),
    '/rest/v1/rpc/oauth_grant_active': () => json(true),
    '/rest/v1/rpc/mcp_begin_call': () => json(42),
    '/rest/v1/rpc/mcp_end_call': () => new Response(null, { status: 204 }),
    '/rest/v1/rpc/mcp_cache_put': () => new Response(null, { status: 204 }),
    '/rest/v1/parcels': () => json(PARCEL),
    ...extra,
  })
}

const bodyOf = (path: string) => JSON.parse(calls.find(c => c.url.endsWith(path))!.body)
const toCogStorage = () => calls.filter(c => new URL(c.url).hostname === 'sentinel-cogs.s3.us-west-2.amazonaws.com')

describe('périodes, quotas et cache', () => {
  it('list_satellite_images sur une période : demande la période au catalogue et écarte les scènes non corrigées', async () => {
    mockData({ '/v1/search': () => json({ features: [scene('2025-07-20', 5), scene('2025-02-10', 2, false), scene('2025-06-01', 40)] }) })
    const { body } = await callTool('list_satellite_images', { parcel_id: PARCEL.id, start_date: '2025-01-01', end_date: '2025-08-31', max_cloud_pct: 50 })
    const data = JSON.parse(body.result.content[0].text)
    expect(data.images.map((i: { date: string }) => i.date)).toEqual(['2025-07-20', '2025-06-01'])
    expect(data.period).toEqual({ start: '2025-01-01', end: '2025-08-31' })
    const search = bodyOf('/v1/search')
    expect(search.datetime).toBe('2025-01-01T00:00:00Z/2025-08-31T23:59:59Z')
    expect(search.query).toEqual({ 'eo:cloud_cover': { lte: 50 } })
  })

  it('get_vegetation_index : un résultat en cache ne réserve aucun calcul et ne lit aucune image', async () => {
    mockData({
      '/v1/search': () => json({ features: [scene('2025-07-20', 5)] }),
      '/rest/v1/rpc/mcp_cache_get': () => json([{ item_id: 'S2B_31UCP_20250720_0_L2A', result: CACHED }]),
    })
    const { body } = await callTool('get_vegetation_index', { parcel_id: PARCEL.id, date: '2025-07-20', index: 'NDVI' })
    const data = JSON.parse(body.result.content[0].text)
    expect(data).toMatchObject({ date: '2025-07-20', mean: 0.61, cloud_masked_pct: 0, histogram: { bins: CACHED.bins } })
    expect(calls.some(c => c.url.endsWith('/rpc/mcp_reserve_heavy'))).toBe(false)
    expect(toCogStorage()).toEqual([])
    expect(bodyOf('/rpc/mcp_cache_get')).toMatchObject({ p_parcel_id: PARCEL.id, p_index: 'NDVI', p_item_ids: ['S2B_31UCP_20250720_0_L2A'], p_input_hash: expect.stringMatching(/^[0-9a-f]{64}$/) })
  })

  it('get_vegetation_index : plafond commun atteint, calcul non lancé', async () => {
    mockData({
      '/v1/search': () => json({ features: [scene('2025-07-20', 5)] }),
      '/rest/v1/rpc/mcp_cache_get': () => json([]),
      '/rest/v1/rpc/mcp_reserve_heavy': () => json(2),
    })
    const { body } = await callTool('get_vegetation_index', { parcel_id: PARCEL.id, date: '2025-07-20', index: 'NDVI' })
    expect(body.result.isError).toBe(true)
    expect(body.result.content[0].text).toContain('Limite journalière de calculs d’indices du service')
    expect(bodyOf('/rpc/mcp_reserve_heavy')).toEqual({ p_id: 42, p_units: 1 })
    expect(toCogStorage()).toEqual([])
  })

  it('get_vegetation_series : réserve seulement les dates absentes du cache', async () => {
    const days = ['2025-03-02', '2025-04-10', '2025-05-15', '2025-06-20', '2025-07-25', '2025-08-28', '2025-08-30']
    mockData({
      '/v1/search': () => json({ features: days.map((d, i) => scene(d, i)).reverse() }),
      '/rest/v1/rpc/mcp_cache_get': () => json(days.slice(0, 4).map(d => ({ item_id: `S2B_31UCP_${d.replaceAll('-', '')}_0_L2A`, result: CACHED }))),
      '/rest/v1/rpc/mcp_reserve_heavy': () => json(1),
    })
    const { body } = await callTool('get_vegetation_series', { parcel_id: PARCEL.id, index: 'NDVI', start_date: '2025-03-01', end_date: '2025-08-31' })
    // 6 dates au plus ; 2 absentes du cache : quota du compte atteint pour elles
    expect(bodyOf('/rpc/mcp_cache_get').p_item_ids).toHaveLength(6)
    expect(bodyOf('/rpc/mcp_reserve_heavy')).toEqual({ p_id: 42, p_units: 2 })
    expect(body.result.content[0].text).toContain('Limite de calculs d’indices atteinte pour votre compte')
    expect(toCogStorage()).toEqual([])
  })

  it('get_vegetation_series : tout en cache, points dans l’ordre chronologique', async () => {
    const days = ['2025-05-15', '2025-03-02', '2025-07-25']
    mockData({
      '/v1/search': () => json({ features: days.map(d => scene(d, 10)) }),
      '/rest/v1/rpc/mcp_cache_get': () => json(days.map(d => ({ item_id: `S2B_31UCP_${d.replaceAll('-', '')}_0_L2A`, result: CACHED }))),
    })
    const { body } = await callTool('get_vegetation_series', { parcel_id: PARCEL.id, index: 'NDMI', start_date: '2025-03-01', end_date: '2025-08-31' })
    const data = JSON.parse(body.result.content[0].text)
    expect(data.points.map((p: { date: string }) => p.date)).toEqual(['2025-03-02', '2025-05-15', '2025-07-25'])
    expect(data.points[0]).toMatchObject({ mean: 0.61, cloud_masked_pct: 0, tile_cloud_cover_pct: 10 })
    expect(bodyOf('/v1/search').query).toEqual({ 'eo:cloud_cover': { lte: 30 } })
    expect(calls.some(c => c.url.endsWith('/rpc/mcp_reserve_heavy'))).toBe(false)
  })

  it('get_weather sur une période : archive Open-Meteo, poids d’une requête par tranche de 14 jours, totaux sans inventer de valeurs', async () => {
    mockData({
      '/v1/archive': () => json({
        daily: {
          time: ['2025-06-01', '2025-06-02', '2025-06-03'],
          temperature_2m_max: [24, 20, null],
          temperature_2m_min: [12, -6, null],
          precipitation_sum: [0, 12.5, null],
          et0_fao_evapotranspiration: [4.1, 2.2, 3],
          weather_code: [1, 63, null],
          wind_speed_10m_max: [10, 25, 18],
        },
      }),
    })
    const { body } = await callTool('get_weather', { parcel_id: PARCEL.id, start_date: '2025-06-01', end_date: '2025-06-30' })
    const data = JSON.parse(body.result.content[0].text)
    expect(bodyOf('/rpc/mcp_begin_call')).toEqual({ p_tool: 'get_weather', p_parcel_id: PARCEL.id, p_weight: 3 })
    const archive = new URL(calls.find(c => c.url.includes('/v1/archive'))!.url)
    expect(archive.searchParams.get('start_date')).toBe('2025-06-01')
    expect(archive.searchParams.get('end_date')).toBe('2025-06-30')
    expect(data.totals).toEqual({ precipitation_mm: 12.5, et0_mm: 9.3, temperature_mean_c: 12.5, growing_degree_days_base0: 25, days_with_missing_values: 1 })
    expect(data.days[2]).toMatchObject({ temperature_max_c: null, precipitation_mm: null, conditions: null })
  })
})

describe('/.well-known/oauth-protected-resource', () => {
  const get = (path?: string[]) => wellKnown.GET(new Request('https://i-parcel.vercel.app/.well-known/oauth-protected-resource'), { params: Promise.resolve({ path }) })

  it.each([[undefined], [['api', 'mcp']]])('décrit la ressource et son serveur d’autorisation (%s)', async path => {
    const res = await get(path)
    expect(await res.json()).toMatchObject({
      resource: MCP_URL,
      authorization_servers: ['https://test-project.supabase.co/auth/v1'],
      bearer_methods_supported: ['header'],
    })
  })

  it('autre chemin : 404', async () => {
    expect((await get(['autre'])).status).toBe(404)
  })
})
