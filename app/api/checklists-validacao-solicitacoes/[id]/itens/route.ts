import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isPrivilegedProfile } from '@/lib/auth'
import { ChecklistError, delegate, upsertChecklistItem } from '@/lib/checklists-validacao'
import { getAuditSession } from '@/lib/audit'

export const runtime = 'nodejs'

type Props = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { id } = await params
  const data = await delegate('checklists_validacao_itens').findMany({
    where: { checklist_validacao_solicitacao_id: id },
    orderBy: { criado_em: 'desc' },
    include: { diffs: { orderBy: { criado_em: 'asc' } } },
  })
  return NextResponse.json({ data })
}

export async function POST(request: Request, { params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  try {
    const { id } = await params
    const body = await request.json()
    const { usuario_id, usuario_nome } = await getAuditSession()
    const item = await upsertChecklistItem({
      solicitacaoId: id,
      tipo_item: body?.tipo_item,
      dados: body?.dados_informados_json ?? body?.dados ?? {},
      user: { id: usuario_id, nome: usuario_nome },
      isAdmin: isPrivilegedProfile((session.user as any)?.perfil),
    })
    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    if (error instanceof ChecklistError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[POST /api/checklists-validacao-solicitacoes/[id]/itens]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
