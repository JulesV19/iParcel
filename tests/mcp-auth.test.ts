import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignJWT } from 'jose'
import { CLAUDE_CLIENT, OTHER_CLIENT, USER_ID, json, jwks, mockFetch, oauthClaims, signToken, stubEnv, type FetchCall } from './helpers'

let auth: typeof import('@/lib/mcp/auth')

// Le module lit l'environnement à son chargement
beforeAll(async () => {
  stubEnv()
  auth = await import('@/lib/mcp/auth')
})

let grant: () => Response
let calls: FetchCall[]

beforeEach(() => {
  grant = () => json(true)
  calls = mockFetch({
    '/auth/v1/.well-known/jwks.json': async () => json(await jwks()),
    '/rest/v1/rpc/oauth_grant_active': () => grant(),
  })
})

const request = (authorization?: string) =>
  new Request('https://i-parcel.vercel.app/api/mcp', { method: 'POST', headers: authorization ? { authorization } : {} })

async function verify(token: string) {
  return auth.verifyAccessToken(request(`Bearer ${token}`))
}

describe('verifyAccessToken', () => {
  it('accepte un jeton OAuth valide d’un client autorisé', async () => {
    const token = await signToken()
    const result = await verify(token)
    expect(result).toMatchObject({ ok: true, userId: USER_ID, auth: { token, clientId: CLAUDE_CLIENT } })
  })

  it('vérifie l’autorisation auprès de Supabase avec le jeton de l’utilisateur', async () => {
    const token = await signToken()
    await verify(token)
    const rpc = calls.find(c => c.url.endsWith('/rpc/oauth_grant_active'))
    expect(rpc?.method).toBe('POST')
    expect(rpc?.headers.get('authorization')).toBe(`Bearer ${token}`)
    expect(rpc?.headers.get('apikey')).toBe('anon-key')
  })

  it('sans en-tête : 401 sans code d’erreur, pour que le client découvre le serveur d’autorisation', async () => {
    expect(await auth.verifyAccessToken(request())).toEqual({ ok: false, status: 401 })
  })

  it.each([
    ['schéma Basic', 'Basic dXNlcjpwYXNz'],
    ['jeton sans signature (alg none)', 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.'],
    ['texte arbitraire', 'Bearer pas-un-jwt'],
  ])('refuse un en-tête mal formé : %s', async (_, header) => {
    expect(await auth.verifyAccessToken(request(header))).toMatchObject({ ok: false, status: 401, error: 'invalid_token', description: 'Malformed bearer token' })
  })

  it('refuse un jeton expiré', async () => {
    const token = await signToken(oauthClaims(), { expiresIn: Math.floor(Date.now() / 1000) - 60 })
    expect(await verify(token)).toMatchObject({ ok: false, status: 401, description: 'Token expired' })
  })

  it('refuse un jeton signé par une autre clé', async () => {
    expect(await verify(await signToken(oauthClaims(), { foreign: true }))).toMatchObject({ ok: false, status: 401, description: 'Invalid token' })
  })

  it('refuse un jeton d’un autre émetteur', async () => {
    expect(await verify(await signToken(oauthClaims(), { issuer: 'https://autre.supabase.co/auth/v1' }))).toMatchObject({ ok: false, description: 'Invalid token' })
  })

  it('refuse un jeton d’une autre audience', async () => {
    expect(await verify(await signToken(oauthClaims({ aud: 'service_role' })))).toMatchObject({ ok: false, description: 'Invalid token' })
  })

  it('refuse un jeton HS256, même bien formé', async () => {
    const token = await new SignJWT(oauthClaims()).setProtectedHeader({ alg: 'HS256' }).setIssuer(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`)
      .setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode('secret-partage-quelconque-de-32-octets'))
    expect(await verify(token)).toMatchObject({ ok: false, status: 401, error: 'invalid_token' })
  })

  it('refuse un jeton de l’app web (sans client_id)', async () => {
    const claims = oauthClaims()
    delete claims.client_id
    expect(await verify(await signToken(claims))).toMatchObject({ ok: false, status: 401, description: 'Token not issued to an OAuth client' })
  })

  it('refuse un compte anonyme', async () => {
    expect(await verify(await signToken(oauthClaims({ is_anonymous: true })))).toMatchObject({ ok: false, description: 'Token not issued to an OAuth client' })
  })

  it('refuse un rôle autre que authenticated', async () => {
    expect(await verify(await signToken(oauthClaims({ role: 'anon' })))).toMatchObject({ ok: false, description: 'Token not issued to an OAuth client' })
  })

  it('refuse un client OAuth absent de la liste blanche (403)', async () => {
    expect(await verify(await signToken(oauthClaims({ client_id: OTHER_CLIENT })))).toMatchObject({ ok: false, status: 403, error: 'insufficient_scope' })
    expect(calls.some(c => c.url.includes('/rpc/'))).toBe(false)
  })

  it('refuse un jeton dont l’accès a été retiré', async () => {
    grant = () => json(false)
    expect(await verify(await signToken())).toMatchObject({ ok: false, status: 401, description: 'Access revoked' })
  })

  it('Supabase en erreur : lève une erreur au lieu de laisser passer', async () => {
    grant = () => json({ message: 'boom' }, 500)
    await expect(verify(await signToken())).rejects.toThrow('HTTP 500')
  })

  it('réponse inattendue de Supabase : jamais considérée comme active', async () => {
    grant = () => json('true')
    expect(await verify(await signToken())).toMatchObject({ ok: false, description: 'Access revoked' })
  })
})

describe('clés publiques Supabase injoignables', () => {
  it('lève une erreur (503) au lieu de répondre « jeton invalide »', async () => {
    vi.resetModules()
    const fresh = await import('@/lib/mcp/auth')
    mockFetch({ '/auth/v1/.well-known/jwks.json': () => { throw new TypeError('fetch failed') } })
    await expect(fresh.verifyAccessToken(request(`Bearer ${await signToken()}`))).rejects.toThrow()
  })
})

describe('wwwAuthenticate', () => {
  it('indique les métadonnées de la ressource et l’erreur', () => {
    expect(auth.wwwAuthenticate('https://i-parcel.vercel.app', { ok: false, status: 401, error: 'invalid_token', description: 'Token expired' }))
      .toBe('Bearer resource_metadata="https://i-parcel.vercel.app/.well-known/oauth-protected-resource/api/mcp", error="invalid_token", error_description="Token expired"')
  })

  it('sans erreur, seulement les métadonnées', () => {
    expect(auth.wwwAuthenticate('https://i-parcel.vercel.app', { ok: false, status: 401 }))
      .toBe('Bearer resource_metadata="https://i-parcel.vercel.app/.well-known/oauth-protected-resource/api/mcp"')
  })
})
