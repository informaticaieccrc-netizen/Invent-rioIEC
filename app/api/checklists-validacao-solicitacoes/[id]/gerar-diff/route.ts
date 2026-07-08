import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { ChecklistError, gerarDiffSolicitacao } from '@/lib/checklists-validacao'

export const runtime = 'nodejs'

type Props = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: Props) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const { id } = await params
    const data = await gerarDiffSolicitacao(id)
    return NextResponse.json({ data })
  } catch (error) {
    if (error instanceof ChecklistError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[POST /api/checklists-validacao-solicitacoes/[id]/gerar-diff]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
