import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { delegate, ChecklistError } from '@/lib/checklists-validacao'
import { getAuditSession, registrarAuditoria } from '@/lib/audit'

export const runtime = 'nodejs'

type Props = { params: Promise<{ id: string }> }

export async function PATCH(_request: Request, { params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  try {
    const { id } = await params
    const { usuario_id, usuario_nome } = await getAuditSession()
    const atual = await delegate('checklists_validacao_solicitacoes').findUnique({ where: { id } })
    if (!atual) throw new ChecklistError('Solicitação não encontrada', 404)
    if (atual.assumido_por && atual.assumido_por !== usuario_id) throw new ChecklistError('Solicitação já assumida por outro técnico', 409)
    const solicitacao = await delegate('checklists_validacao_solicitacoes').update({
      where: { id },
      data: { status: 'assumida', assumido_por: usuario_id, assumido_em: atual.assumido_em ?? new Date(), atualizado_em: new Date() },
    })
    await registrarAuditoria({
      tabela: 'checklists_validacao_solicitacoes',
      registro_id: id,
      acao: 'UPDATE',
      descricao: 'Solicitação assumida pela interface do inventário',
      dados_anteriores: atual,
      dados_novos: solicitacao,
      usuario_id,
      usuario_nome,
    })
    return NextResponse.json(solicitacao)
  } catch (error) {
    if (error instanceof ChecklistError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[PATCH /api/checklists-validacao-solicitacoes/[id]/assumir]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
