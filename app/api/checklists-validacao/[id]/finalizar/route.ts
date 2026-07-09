import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { delegate } from '@/lib/checklists-validacao'
import { getAuditSession, registrarAuditoria } from '@/lib/audit'

export const runtime = 'nodejs'

type Props = { params: Promise<{ id: string }> }

export async function PATCH(_request: Request, { params }: Props) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const { id } = await params
    const { usuario_id, usuario_nome } = await getAuditSession()
    const checklist = await delegate('checklists_validacao').update({
      where: { id },
      data: { status: 'finalizado', atualizado_em: new Date() },
    })
    await registrarAuditoria({
      tabela: 'checklists_validacao',
      registro_id: id,
      acao: 'UPDATE',
      descricao: 'Checklist finalizado',
      dados_novos: checklist,
      usuario_id,
      usuario_nome,
    })
    return NextResponse.json(checklist)
  } catch (error) {
    console.error('[PATCH /api/checklists-validacao/[id]/finalizar]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
