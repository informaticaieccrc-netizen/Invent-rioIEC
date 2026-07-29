import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isPrivilegedProfile } from '@/lib/auth'
import { ChecklistError, delegate, ensureSolicitacaoEditable, gerarDiffSolicitacao } from '@/lib/checklists-validacao'
import { getAuditSession, registrarAuditoria } from '@/lib/audit'
import { notifyChecklistSolicitacaoStatus } from '@/lib/checklist/power-automate'

export const runtime = 'nodejs'

type Props = { params: Promise<{ id: string }> }

export async function PATCH(_request: Request, { params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  try {
    const { id } = await params
    const { usuario_id, usuario_nome } = await getAuditSession()
    const isAdmin = isPrivilegedProfile((session.user as any)?.perfil)
    const atual = await ensureSolicitacaoEditable(id, { id: usuario_id, nome: usuario_nome }, isAdmin)
    if (atual.tipo_solicitacao === 'SETOR') await gerarDiffSolicitacao(id)
    const now = new Date()
    const shouldAssignOnFinish = !atual.assumido_por && Boolean(usuario_id)
    const solicitacao = await delegate('checklists_validacao_solicitacoes').update({
      where: { id },
      data: {
        status: 'finalizada',
        finalizado_em: now,
        atualizado_em: now,
        ...(shouldAssignOnFinish ? { assumido_por: usuario_id, assumido_em: now } : {}),
      },
    })
    await registrarAuditoria({
      tabela: 'checklists_validacao_solicitacoes',
      registro_id: id,
      acao: 'UPDATE',
      descricao: shouldAssignOnFinish ? 'Solicitação atribuída automaticamente e finalizada' : 'Solicitação finalizada',
      dados_anteriores: atual,
      dados_novos: solicitacao,
      usuario_id,
      usuario_nome,
    })
    await notifyChecklistSolicitacaoStatus(id, 'solicitacao_finalizada')
    return NextResponse.json(solicitacao)
  } catch (error) {
    if (error instanceof ChecklistError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[PATCH /api/checklists-validacao-solicitacoes/[id]/finalizar]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
