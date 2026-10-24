import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose'
import { vi } from 'vitest'

// Faux projet Supabase : aucune requête ne sort de la machine
export const SUPABASE_URL = 'https://test-project.supabase.co'
export const ISSUER = `${SUPABASE_URL}/auth/v1`
export const CLAUDE_CLIENT = '11111111-1111-4111-8111-111111111111'
export const OTHER_CLIENT = '22222222-2222-4222-8222-222222222222'
export const USER_ID = '33333333-3333-4333-8333-333333333333'

export function stubEnv() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
  vi.stubEnv('MCP_CLIENT_ID_CLAUDE', CLAUDE_CLIENT)
  vi.stubEnv('MCP_CLIENT_ID_CLAUDE_CODE', '')
  vi.stubEnv('MCP_CLIENT_ID_VSCODE', '')
  vi.stubEnv('MCP_CLIENT_ID_CURSOR', '')
  vi.stubEnv('MCP_ALLOWED_CLIENT_IDS', '')
}

const supabaseKey = generateKeyPair('ES256')
const foreignKey = generateKeyPair('ES256')

export async function jwks() {
  const jwk = await exportJWK((await supabaseKey).publicKey)
  return { keys: [{ ...jwk, kid: 'supabase-key', alg: 'ES256', use: 'sig' }] }
}

// Jeton OAuth tel que le délivre Supabase après le hook (supabase/oauth-revocation.sql)
export function oauthClaims(overrides: JWTPayload = {}): JWTPayload {
  return {
    sub: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    client_id: CLAUDE_CLIENT,
    oauth_sid: '44444444-4444-4444-8444-444444444444',
    session_id: '55555555-5555-4555-8555-555555555555',
    email: '',
    is_anonymous: false,
    ...overrides,
  }
}

export async function signToken(claims: JWTPayload = oauthClaims(), opts: { foreign?: boolean; issuer?: string; expiresIn?: string | number } = {}) {
  const key = (await (opts.foreign ? foreignKey : supabaseKey)).privateKey
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256', kid: 'supabase-key', typ: 'JWT' })
    .setIssuer(opts.issuer ?? ISSUER)
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? '1h')
    .sign(key)
}

export type FetchCall = { url: string; method: string; headers: Headers; body: string }
type Route = (call: FetchCall) => Response | Promise<Response>

// Remplace fetch : chaque adresse appelée doit avoir une réponse prévue, sinon le test échoue
export function mockFetch(routes: Record<string, Route>) {
  const calls: FetchCall[] = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init)
    const call = { url: req.url, method: req.method, headers: req.headers, body: await req.text() }
    calls.push(call)
    const path = new URL(req.url).pathname
    const route = routes[path]
    if (!route) throw new Error(`Requête inattendue : ${req.method} ${req.url}`)
    return route(call)
  })
  vi.stubGlobal('fetch', fn)
  return calls
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
