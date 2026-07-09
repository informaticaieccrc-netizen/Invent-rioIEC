import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { ChecklistError, delegate, ensureSolicitacaoNotAssimilated, ensureSolicitacaoRevisable } from '@/lib/checklists-validacao'
import { getAuditSession, registrarAuditoria } from '@/lib/audit'

export const runtime = 'nodejs'

type Props = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Props) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const { id } = await params
    const body = await request.json()
    const { usuario_id, usuario_nome } = await getAuditSession()
    await ensureSolicitacaoRevisable(id)
    await ensureSolicitacaoNotAssimilated(id)
    const anterior = await delegate('checklists_validacao_solicitacoes').findUnique({ where: { id } })
    const status = body?.status_revisao === 'recusado' ? 'recusado' : 'aprovado'
    const solicitacao = await delegate('checklists_validacao_solicitacoes').update({
      where: { id },
      data: { status_revisao: status, revisado_por: usuario_id, revisado_em: new Date(), atualizado_em: new Date() },
    })
    await registrarAuditoria({
      tabela: 'checklists_validacao_solicitacoes',
      registro_id: id,
      acao: status === 'aprovado' ? 'APROVAR' : 'RECUSAR',
      descricao: status === 'aprovado' ? 'Rack aprovado para assimilação' : 'Rack recusado na revisão',
      dados_anteriores: anterior,
      dados_novos: solicitacao,
      usuario_id,
      usuario_nome,
    })
    return NextResponse.json(solicitacao)
  } catch (error) {
    if (error instanceof ChecklistError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[PATCH /api/checklists-validacao-solicitacoes/[id]/revisar-rack]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
