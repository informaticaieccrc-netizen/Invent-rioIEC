export function isChecklistIntegrationAuthorized(request: Request) {
  const expected = process.env.CHECKLIST_INTEGRATION_TOKEN?.trim()
  if (!expected) {
    console.warn('[checklist auth] CHECKLIST_INTEGRATION_TOKEN não configurado')
    return false
  }

  const authorization = request.headers.get('authorization') || ''
  const apiKey = request.headers.get('x-api-key')?.trim() || ''
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()

  return bearer === expected || apiKey === expected
}
