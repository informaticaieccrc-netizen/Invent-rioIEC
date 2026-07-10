import { NextResponse } from 'next/server'
import { isChecklistIntegrationAuthorized } from '@/lib/checklist/auth'
import { plannerVincularSolicitacao } from '@/lib/checklist/planner'
import { ChecklistError } from '@/lib/checklists-validacao'

export const runtime = 'nodejs'

type Props = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Props) {
  if (!isChecklistIntegrationAuthorized(request)) {
    return NextResponse.json({ error: 'Token de integração Checklist inválido' }, { status: 401 })
  }

  try {
    const { id } = await params
    const result = await plannerVincularSolicitacao(id, await request.json().catch(() => ({})))
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ChecklistError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[POST /api/checklist/solicitacoes/[id]/planner-id]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
