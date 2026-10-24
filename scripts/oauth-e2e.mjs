// Joue le rôle d'un client OAuth (une IA) : parcours d'autorisation complet avec PKCE,
// puis vérifie ce que le jeton obtenu (et le jeton renouvelé) permet réellement.
// Usage : node scripts/oauth-e2e.mjs .env.local <client_id> [url du serveur MCP] [--revocation]
// Client OAuth de test requis : public, adresse de retour http://localhost:8976/callback, et son
// identifiant dans MCP_ALLOWED_CLIENT_IDS du serveur testé
// --revocation : à la fin, attend que l'accès soit retiré depuis /applications puis vérifie la coupure
import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline/promises'

const args = process.argv.slice(2)
const testRevocation = args.includes('--revocation')
const [envPath, clientId, mcpUrl] = args.filter(a => !a.startsWith('--'))
if (!envPath || !clientId) { console.error('Usage : node scripts/oauth-e2e.mjs .env.local <client_id> [url MCP] [--revocation]'); process.exit(1) }
process.loadEnvFile(envPath)
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const PORT = 8976
const REDIRECT = `http://localhost:${PORT}/callback`

const b64url = buf => buf.toString('base64url')
const verifier = b64url(randomBytes(32))
const challenge = b64url(createHash('sha256').update(verifier).digest())
const state = b64url(randomBytes(16))

const meta = await (await fetch(`${SUPABASE}/.well-known/oauth-authorization-server/auth/v1`)).json()
const authorize = new URL(meta.authorization_endpoint)
authorize.search = new URLSearchParams({
  response_type: 'code', client_id: clientId, redirect_uri: REDIRECT,
  code_challenge: challenge, code_challenge_method: 'S256', state, scope: 'openid',
}).toString()
console.log('Ouvrez cette adresse dans le navigateur :\n' + authorize)

const code = await new Promise((resolve, reject) => {
  const server = createServer((req, res) => {
    const url = new URL(req.url, REDIRECT)
    if (url.pathname !== '/callback') { res.writeHead(404).end(); return }
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('Terminé, revenez au terminal.')
    server.close()
    if (url.searchParams.get('state') !== state) reject(new Error('state différent : réponse rejetée'))
    else if (url.searchParams.get('error')) reject(new Error(`Refusé : ${url.searchParams.get('error')} ${url.searchParams.get('error_description') ?? ''}`))
    else resolve(url.searchParams.get('code'))
  }).listen(PORT, 'localhost')
}).catch(e => { console.log(`\n${e.message}`); process.exit(0) })

async function tokenRequest(params) {
  const res = await fetch(meta.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', apikey: ANON },
    body: new URLSearchParams({ client_id: clientId, ...params }),
  })
  return { res, body: await res.json() }
}

async function token(params) {
  const { res, body } = await tokenRequest(params)
  if (!res.ok) { console.error('Point de terminaison token refusé :', res.status, body); process.exit(1) }
  return body
}

let failures = 0
const check = (label, ok, detail) => {
  if (!ok) failures++
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? `  (${detail})` : ''}`)
}

async function probe(label, accessToken) {
  console.log(`\n— ${label}`)
  const [header, claims] = accessToken.split('.').slice(0, 2).map(p => JSON.parse(Buffer.from(p, 'base64url')))
  check('Signé en ES256', header.alg === 'ES256', header.alg)
  check('client_id présent', claims.client_id === clientId)
  check('Email retiré du jeton', claims.email === '' && Object.keys(claims.user_metadata ?? {}).length === 0)

  const auth = { apikey: ANON, authorization: `Bearer ${accessToken}` }
  const read = await fetch(`${SUPABASE}/rest/v1/parcels?select=id,name`, { headers: auth })
  const list = read.ok ? await read.json() : []
  check('Lecture des parcelles autorisée', read.ok && Array.isArray(list), `${read.status}, ${list.length} parcelle(s)`)
  if (list[0]) {
    // Réécrit le même nom : sans effet même si la policy était absente
    const patch = await fetch(`${SUPABASE}/rest/v1/parcels?id=eq.${list[0].id}`, {
      method: 'PATCH', headers: { ...auth, 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify({ name: list[0].name }),
    })
    const rows = patch.ok ? await patch.json() : null
    check('Modification d’une parcelle sans effet', patch.ok && rows.length === 0, `${patch.status}, ${rows?.length ?? '?'} ligne(s)`)
  }
  const getUser = await fetch(`${SUPABASE}/auth/v1/user`, { headers: auth })
  check('API Auth : lecture du compte refusée', getUser.status === 403, `${getUser.status} ${(await getUser.json()).error_code ?? ''}`)
  // Mise à jour vide des métadonnées : ne change rien même si elle était acceptée
  const putUser = await fetch(`${SUPABASE}/auth/v1/user`, {
    method: 'PUT', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ data: {} }),
  })
  check('API Auth : écriture sur le compte refusée', putUser.status === 403, `${putUser.status} ${(await putUser.json()).error_code ?? ''}`)
}

const first = await token({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: verifier })
await probe('Jeton initial', first.access_token)
if (mcpUrl) {
  console.log(`\n— Serveur MCP (${mcpUrl})`)
  let rpcId = 0
  const rpc = async (method, params, accessToken = first.access_token) => {
    const res = await fetch(mcpUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    })
    return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? await res.json() : null }
  }
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'oauth-test', version: '1' } })
  check('initialize', init.status === 200 && init.body?.result?.serverInfo?.name === 'iparcel', `${init.status}`)
  const tools = await rpc('tools/list', {})
  const names = tools.body?.result?.tools?.map(t => t.name) ?? []
  check('tools/list', names.includes('list_parcels'), names.join(', '))
  const call = await rpc('tools/call', { name: 'list_parcels', arguments: {} })
  const text = call.body?.result?.content?.[0]?.text
  check('list_parcels', call.status === 200 && !call.body?.result?.isError, text?.slice(0, 160))
  const parcelId = JSON.parse(text ?? '{}').parcels?.[0]?.id
  if (parcelId) {
    const callTool = async (name, args) => {
      const r = await rpc('tools/call', { name, arguments: args })
      const out = r.body?.result?.content?.[0]?.text ?? ''
      check(name, r.status === 200 && !r.body?.result?.isError, out.slice(0, 220))
      return out
    }
    await callTool('get_parcel', { parcel_id: parcelId })
    await callTool('get_weather', { parcel_id: parcelId })
    const images = JSON.parse(await callTool('list_satellite_images', { parcel_id: parcelId }) || '{}').images ?? []
    const clearest = [...images].sort((a, b) => (a.cloud_cover_pct ?? 100) - (b.cloud_cover_pct ?? 100))[0]
    if (clearest) await callTool('get_vegetation_index', { parcel_id: parcelId, date: clearest.date, index: 'NDVI' })
    const other = await rpc('tools/call', { name: 'get_parcel', arguments: { parcel_id: '00000000-0000-4000-8000-000000000000' } })
    check('Parcelle inconnue refusée', other.body?.result?.isError === true, other.body?.result?.content?.[0]?.text)
    const invalid = await rpc('tools/call', { name: 'get_parcel', arguments: { parcel_id: '../../etc' } })
    check('Identifiant invalide refusé', invalid.body?.result?.isError === true || Boolean(invalid.body?.error), JSON.stringify(invalid.body?.result?.content?.[0]?.text ?? invalid.body?.error).slice(0, 120))
  }
  const forged = first.access_token.slice(0, -4) + (first.access_token.endsWith('AAAA') ? 'BBBB' : 'AAAA')
  const bad = await rpc('tools/list', {}, forged)
  check('Signature falsifiée refusée', bad.status === 401, `${bad.status}`)
}
let refreshed
if (first.refresh_token) {
  refreshed = await token({ grant_type: 'refresh_token', refresh_token: first.refresh_token })
  await probe('Jeton renouvelé (refresh token)', refreshed.access_token)
} else {
  check('Refresh token délivré', false)
}
if (testRevocation && refreshed) {
  console.log('\n— Révocation')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  await rl.question('Retirez l’accès de cette application sur /applications, puis appuyez sur Entrée… ')
  rl.close()
  const auth = { apikey: ANON, authorization: `Bearer ${refreshed.access_token}` }
  const read = await fetch(`${SUPABASE}/rest/v1/parcels?select=id`, { headers: auth })
  const rows = read.ok ? await read.json() : null
  check('API Supabase : plus aucune parcelle lisible', read.ok && rows.length === 0, `${read.status}, ${rows?.length ?? '?'} ligne(s)`)
  if (mcpUrl) {
    const res = await fetch(mcpUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18', authorization: `Bearer ${refreshed.access_token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    })
    const www = res.headers.get('www-authenticate') ?? ''
    check('Serveur MCP : jeton refusé', res.status === 401 && www.includes('Access revoked'), `${res.status} ${www.match(/error_description="[^"]*"/)?.[0] ?? ''}`)
  }
  const again = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshed.refresh_token })
  check('Refresh token refusé', !again.res.ok, `${again.res.status} ${again.body.error_code ?? again.body.error ?? ''}`)
}
console.log(failures ? `\n${failures} vérification(s) en échec` : '\nToutes les vérifications passent')
process.exit(failures ? 1 : 0)
