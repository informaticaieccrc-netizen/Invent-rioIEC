import { NextResponse } from 'next/server'
import { isChecklistIntegrationAuthorized } from '@/lib/checklist/auth'

export const runtime = 'nodejs'

function integrationError() {
  return NextResponse.json({ error: 'Token de integração Checklist inválido' }, { status: 401 })
}

function missingSolicitacaoId() {
  return NextResponse.json({
    error: 'ID da solicitação ausente na URL',
    expected: '/api/checklists-validacao-solicitacoes/{id}/assumir',
    example: '/api/checklists-validacao-solicitacoes/ad937650-23e4-48ef-b714-9e250a71414e/assumir',
  }, { status: 400 })
}

export async function PATCH(request: Request) {
  if (!isChecklistIntegrationAuthorized(request)) return integrationError()
  return missingSolicitacaoId()
}

export async function POST(request: Request) {
  if (!isChecklistIntegrationAuthorized(request)) return integrationError()
  return missingSolicitacaoId()
}
