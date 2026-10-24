import { createRemoteJWKSet, errors, jwtVerify } from 'jose'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { MCP_CLIENTS } from '@/lib/mcp/clients'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const ISSUER = `${SUPABASE_URL}/auth/v1`
// Clés publiques de Supabase, mises en cache par jose entre deux requêtes
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`))

// Clients OAuth autorisés, en plus de leur enregistrement dans Supabase : liste vide = tout est refusé.
// MCP_ALLOWED_CLIENT_IDS : clients supplémentaires, absents de la page /connecter (tests)
const ALLOWED_CLIENTS = new Set(
  [...Object.values(MCP_CLIENTS), ...(process.env.MCP_ALLOWED_CLIENT_IDS ?? '').split(',')].map(s => s.trim()).filter(Boolean),
)

export const MCP_PATH = '/api/mcp'

export function resourceUrl(origin: string): string {
  return `${origin}${MCP_PATH}`
}

export function resourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource${MCP_PATH}`
}

export function authorizationServer(): string {
  return ISSUER
}

export type AuthResult =
  | { ok: true; auth: AuthInfo; userId: string }
  | { ok: false; status: 401 | 403; error?: 'invalid_token' | 'insufficient_scope'; description?: string }

export async function verifyAccessToken(req: Request): Promise<AuthResult> {
  const header = req.headers.get('authorization') ?? ''
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(header)
  // Sans jeton, pas de code d'erreur : le client découvre le serveur d'autorisation (RFC 6750 §3.1)
  if (!header) return { ok: false, status: 401 }
  if (!match) return { ok: false, status: 401, error: 'invalid_token', description: 'Malformed bearer token' }

  let payload
  try {
    ({ payload } = await jwtVerify(match[1], JWKS, {
      issuer: ISSUER,
      audience: 'authenticated',
      algorithms: ['ES256'],
      requiredClaims: ['sub', 'exp', 'iat'],
    }))
  } catch (e) {
    const expired = e instanceof errors.JWTExpired
    // Clés publiques injoignables : panne côté Supabase, pas un jeton invalide
    if (e instanceof errors.JWKSTimeout || (!expired && !(e instanceof errors.JOSEError))) throw e
    return { ok: false, status: 401, error: 'invalid_token', description: expired ? 'Token expired' : 'Invalid token' }
  }

  // Un jeton de l'app web (sans client_id) ou d'un client hors liste n'a rien à faire ici
  const clientId = typeof payload.client_id === 'string' ? payload.client_id : ''
  if (payload.role !== 'authenticated' || payload.is_anonymous === true || !clientId) {
    return { ok: false, status: 401, error: 'invalid_token', description: 'Token not issued to an OAuth client' }
  }
  if (!ALLOWED_CLIENTS.has(clientId)) {
    return { ok: false, status: 403, error: 'insufficient_scope', description: 'OAuth client not allowed' }
  }
  if (!(await grantActive(match[1]))) {
    return { ok: false, status: 401, error: 'invalid_token', description: 'Access revoked' }
  }

  return {
    ok: true,
    userId: payload.sub!,
    auth: {
      token: match[1],
      clientId,
      scopes: typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : [],
      expiresAt: payload.exp,
    },
  }
}

// Accès retiré par l'utilisateur : le jeton reste signé et non expiré, seule sa session a
// disparu (supabase/oauth-revocation.sql). Erreur réseau ou base : levée, jamais « actif »
async function grantActive(token: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/oauth_grant_active`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: '{}',
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`oauth_grant_active : HTTP ${res.status}`)
  return (await res.json()) === true
}

// Les descriptions restent en ASCII : elles sont placées dans un en-tête HTTP
export function wwwAuthenticate(origin: string, result: Extract<AuthResult, { ok: false }>): string {
  const params = [`resource_metadata="${resourceMetadataUrl(origin)}"`]
  if (result.error) params.push(`error="${result.error}"`)
  if (result.description) params.push(`error_description="${result.description}"`)
  return `Bearer ${params.join(', ')}`
}
