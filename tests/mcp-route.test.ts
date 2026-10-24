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

  it('liste les 5 outils, tous en lecture seule', async () => {
    const { res, body } = await rpc('tools/list', {}, await signToken())
    expect(res.status).toBe(200)
    const tools = body.result.tools as { name: string; annotations?: { readOnlyHint?: boolean } }[]
    expect(tools.map(t => t.name).sort()).toEqual(['get_parcel', 'get_vegetation_index', 'get_weather', 'list_parcels', 'list_satellite_images'])
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
    expect(JSON.parse(begin.body)).toEqual({ p_tool: 'list_parcels', p_parcel_id: null, p_heavy: false })
    const end = calls.find(c => c.url.endsWith('/rpc/mcp_end_call'))!
    expect(JSON.parse(end.body)).toEqual({ p_id: 42, p_ok: true })
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
  ])('paramètres refusés avant tout accès aux données : %s', async (_, name, args) => {
    const { body } = await callTool(name, args)
    expect(body.result?.isError === true || body.error !== undefined).toBe(true)
    expect(calls.filter(c => !c.url.endsWith('/rpc/oauth_grant_active') && c.url.includes('/rest/v1/'))).toEqual([])
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
