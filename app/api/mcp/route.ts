import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { verifyAccessToken, wwwAuthenticate } from '@/lib/mcp/auth'
import { buildServer } from '@/lib/mcp/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 90

// Authentification par en-tête Bearer, sans cookie : l'ouvrir à toutes les origines n'expose rien
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
}

function withCors(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v)
  headers.set('Cache-Control', 'no-store')
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

export async function POST(req: Request) {
  const origin = new URL(req.url).origin
  let result
  try {
    result = await verifyAccessToken(req)
  } catch (e) {
    console.error('MCP auth :', e instanceof Error ? e.message : e)
    return withCors(new Response(null, { status: 503, headers: { 'Retry-After': '30' } }))
  }
  if (!result.ok) {
    return withCors(new Response(null, { status: result.status, headers: { 'WWW-Authenticate': wwwAuthenticate(origin, result) } }))
  }

  // Sans état : un serveur par requête, rien n'est partagé entre utilisateurs
  const server = buildServer(result.auth.token, result.userId)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 64 * 1024,
  })
  await server.connect(transport)
  try {
    return withCors(await transport.handleRequest(req, { authInfo: result.auth }))
  } finally {
    await server.close()
  }
}

// Pas de flux SSE ni de session en mode sans état
function notAllowed() {
  return withCors(new Response(null, { status: 405, headers: { Allow: 'POST, OPTIONS' } }))
}
export const GET = notAllowed
export const DELETE = notAllowed

export function OPTIONS() {
  return withCors(new Response(null, { status: 204 }))
}
