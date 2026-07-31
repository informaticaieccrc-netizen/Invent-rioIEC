import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { ChecklistError, aprovarTudoSolicitacao } from '@/lib/checklists-validacao'
import { getAuditSession } from '@/lib/audit'

export const runtime = 'nodejs'

type Props = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: Props) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const { id } = await params
    const { usuario_id, usuario_nome } = await getAuditSession()
    const result = await aprovarTudoSolicitacao(id, { id: usuario_id, nome: usuario_nome })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ChecklistError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[POST /api/checklists-validacao-solicitacoes/[id]/aprovar-tudo]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
