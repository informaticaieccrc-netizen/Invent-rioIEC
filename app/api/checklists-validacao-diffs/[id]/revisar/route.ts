import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { ChecklistError, delegate, ensureSolicitacaoNotAssimilated, ensureSolicitacaoRevisable, refreshItemReviewStatuses } from '@/lib/checklists-validacao'
import { getAuditSession, registrarAuditoria } from '@/lib/audit'

export const runtime = 'nodejs'

type Props = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Props) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const { id } = await params
    const body = await request.json()
    const status = body?.status_revisao === 'recusado' ? 'recusado' : 'aprovado'
    const { usuario_id, usuario_nome } = await getAuditSession()
    const current = await delegate('checklists_validacao_diffs').findUnique({ where: { id } })
    if (!current) return NextResponse.json({ error: 'Diff não encontrado' }, { status: 404 })
    await ensureSolicitacaoRevisable(current.checklist_validacao_solicitacao_id)
    await ensureSolicitacaoNotAssimilated(current.checklist_validacao_solicitacao_id)
    const diff = await delegate('checklists_validacao_diffs').update({
      where: { id },
      data: { status_revisao: status, atualizado_em: new Date() },
    })
    await refreshItemReviewStatuses(diff.checklist_validacao_solicitacao_id)
    await registrarAuditoria({
      tabela: 'checklists_validacao_diffs',
      registro_id: id,
      acao: status === 'aprovado' ? 'APROVAR' : 'RECUSAR',
      descricao: status === 'aprovado' ? 'Campo aprovado na revisão do checklist' : 'Campo recusado na revisão do checklist',
      dados_anteriores: current,
      dados_novos: diff,
      usuario_id,
      usuario_nome,
    })
    return NextResponse.json(diff)
  } catch (error) {
    if (error instanceof ChecklistError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[PATCH /api/checklists-validacao-diffs/[id]/revisar]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
