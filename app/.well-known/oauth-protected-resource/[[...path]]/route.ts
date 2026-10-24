import { authorizationServer, MCP_PATH, resourceUrl } from '@/lib/mcp/auth'

export const dynamic = 'force-dynamic'

// RFC 9728 : indique aux clients MCP quel serveur d'autorisation délivre les jetons.
// Servi à la racine et sous /api/mcp, les clients essayant l'une ou l'autre adresse.
export async function GET(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params
  const suffix = path ? `/${path.join('/')}` : ''
  if (suffix !== '' && suffix !== MCP_PATH) return new Response(null, { status: 404 })
  const origin = new URL(req.url).origin
  return Response.json({
    resource: resourceUrl(origin),
    authorization_servers: [authorizationServer()],
    bearer_methods_supported: ['header'],
    scopes_supported: ['openid'],
    resource_name: 'iParcel',
  }, {
    headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' },
  })
}
