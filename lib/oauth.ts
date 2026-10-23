// Le SDK insère l'identifiant tel quel dans l'URL de l'API Auth : on refuse tout ce qui pourrait
// changer le chemin appelé (« / », « .. », « ? »…)
const AUTHORIZATION_ID = /^[A-Za-z0-9_-]{1,128}$/

export function readAuthorizationId(search: string): string | null {
  const id = new URLSearchParams(search).get('authorization_id')
  return id && AUTHORIZATION_ID.test(id) ? id : null
}

export function consentPath(authorizationId: string): string {
  return `/oauth/consent?authorization_id=${authorizationId}`
}
