import { getToken } from 'next-auth/jwt'
import { NextResponse, type NextRequest } from 'next/server'

const SNOW_EXTERNAL_PATHS = [
  /^\/api\/snow\/processar-xlsx$/,
  /^\/api\/snow\/itens\/[^/]+\/assumir$/,
  /^\/api\/snow\/itens\/[^/]+\/csc$/,
  /^\/api\/snow\/itens\/[^/]+\/concluir$/,
]

const CHECKLIST_EXTERNAL_PATHS = [
  /^\/api\/checklist(?:\/.*)?$/,
]

const CHECKLIST_INTERNAL_INTEGRATION_PATHS = [
  /^\/api\/checklists-validacao-solicitacoes\/[^/]+\/assumir$/,
  /^\/api\/checklists-validacao-solicitacoes\/[^/]+\/finalizar$/,
]

function hasSnowIntegrationToken(req: Request) {
  const expected = process.env.SNOW_INTEGRATION_TOKEN?.trim()
  if (!expected) return false

  const authorization = req.headers.get('authorization') || ''
  const apiKey = req.headers.get('x-api-key')?.trim() || ''
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()

  return bearer === expected || apiKey === expected
}

function hasChecklistIntegrationToken(req: Request) {
  const expected = process.env.CHECKLIST_INTEGRATION_TOKEN?.trim()
  if (!expected) return false

  const authorization = req.headers.get('authorization') || ''
  const apiKey = req.headers.get('x-api-key')?.trim() || ''
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()

  return bearer === expected || apiKey === expected
}

function hasChecklistIntegrationCredential(req: Request) {
  return Boolean(req.headers.get('authorization') || req.headers.get('x-api-key'))
}

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname

  if (SNOW_EXTERNAL_PATHS.some(pattern => pattern.test(pathname))) {
    if (hasSnowIntegrationToken(req)) return NextResponse.next()

    return NextResponse.json(
      { error: 'Token de integração SNOW inválido' },
      { status: 401 }
    )
  }

  if (CHECKLIST_EXTERNAL_PATHS.some(pattern => pattern.test(pathname))) {
    // /api/checklist serve o Swagger e os callbacks externos. Os handlers validam
    // CHECKLIST_INTEGRATION_TOKEN e retornam 401 JSON, sem redirect para /login.
    return NextResponse.next()
  }

  if (CHECKLIST_INTERNAL_INTEGRATION_PATHS.some(pattern => pattern.test(pathname))) {
    if (hasChecklistIntegrationToken(req)) return NextResponse.next()
    if (hasChecklistIntegrationCredential(req)) {
      return NextResponse.json(
        { error: 'Token de integração Checklist inválido' },
        { status: 401 }
      )
    }
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  })

  if (token) return NextResponse.next()

  const loginUrl = req.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.searchParams.set('callbackUrl', req.nextUrl.href)

  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)'],
}
