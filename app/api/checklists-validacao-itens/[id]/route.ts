import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isPrivilegedProfile } from '@/lib/auth'
import { ChecklistError, delegate, ensureSolicitacaoFillable, upsertChecklistItem } from '@/lib/checklists-validacao'
import { getAuditSession, registrarAuditoria } from '@/lib/audit'

export const runtime = 'nodejs'

type Props = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  try {
    const { id } = await params
    const current = await delegate('checklists_validacao_itens').findUnique({ where: { id } })
    if (!current) throw new ChecklistError('Item não encontrado', 404)
    const body = await request.json()
    const { usuario_id, usuario_nome } = await getAuditSession()
    const item = await upsertChecklistItem({
      itemId: id,
      solicitacaoId: current.checklist_validacao_solicitacao_id,
      tipo_item: body?.tipo_item ?? current.tipo_item,
      dados: body?.dados_informados_json ?? body?.dados ?? {},
      user: { id: usuario_id, nome: usuario_nome },
      isAdmin: isPrivilegedProfile((session.user as any)?.perfil),
    })
    return NextResponse.json(item)
  } catch (error) {
    if (error instanceof ChecklistError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[PATCH /api/checklists-validacao-itens/[id]]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  try {
    const { id } = await params
    const current = await delegate('checklists_validacao_itens').findUnique({ where: { id } })
    if (!current) throw new ChecklistError('Item não encontrado', 404)
    const { usuario_id, usuario_nome } = await getAuditSession()
    await ensureSolicitacaoFillable(
      current.checklist_validacao_solicitacao_id,
      { id: usuario_id, nome: usuario_nome },
      isPrivilegedProfile((session.user as any)?.perfil)
    )
    await delegate('checklists_validacao_itens').delete({ where: { id } })
    await registrarAuditoria({
      tabela: 'checklists_validacao_itens',
      registro_id: id,
      acao: 'DELETE',
      descricao: `Item ${current.tipo_item} do checklist removido`,
      dados_anteriores: current,
      usuario_id,
      usuario_nome,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof ChecklistError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[DELETE /api/checklists-validacao-itens/[id]]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
