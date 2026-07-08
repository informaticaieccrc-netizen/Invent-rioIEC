import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isPrivilegedProfile } from '@/lib/auth'
import { ChecklistError, delegate, ensureSolicitacaoNotAssimilated } from '@/lib/checklists-validacao'
import { getAuditSession, registrarAuditoria } from '@/lib/audit'

export const runtime = 'nodejs'

type Props = { params: Promise<{ id: string }> }

export async function PATCH(_request: Request, { params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const { id } = await params
    const { usuario_id, usuario_nome } = await getAuditSession()
    const isAdmin = isPrivilegedProfile((session.user as any)?.perfil)
    const atual = await delegate('checklists_validacao_solicitacoes').findUnique({ where: { id } })
    if (!atual) throw new ChecklistError('Solicitação não encontrada', 404)
    if (!isAdmin && atual.assumido_por !== usuario_id) throw new ChecklistError('Apenas o dono da solicitação pode reabrir', 403)
    if (atual.status !== 'finalizada' && atual.status !== 'revisada') {
      throw new ChecklistError('Apenas solicitações finalizadas ou revisadas podem ser reabertas', 409)
    }
    await ensureSolicitacaoNotAssimilated(id)

    const solicitacao = await delegate('checklists_validacao_solicitacoes').update({
      where: { id },
      data: {
        status: atual.assumido_por ? 'assumida' : 'aberta',
        status_revisao: 'pendente',
        finalizado_em: null,
        revisado_por: null,
        revisado_em: null,
        atualizado_em: new Date(),
      },
    })

    await delegate('checklists_validacao_diffs').deleteMany({ where: { checklist_validacao_solicitacao_id: id } })
    await delegate('checklists_validacao_itens').updateMany({
      where: { checklist_validacao_solicitacao_id: id },
      data: { status_revisao: 'pendente', revisado_por: null, revisado_em: null, atualizado_em: new Date() },
    })

    await registrarAuditoria({
      tabela: 'checklists_validacao_solicitacoes',
      registro_id: id,
      acao: 'UPDATE',
      descricao: 'Solicitação reaberta para edição',
      dados_anteriores: atual,
      dados_novos: solicitacao,
      usuario_id,
      usuario_nome,
    })

    return NextResponse.json(solicitacao)
  } catch (error) {
    if (error instanceof ChecklistError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[PATCH /api/checklists-validacao-solicitacoes/[id]/reabrir]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
