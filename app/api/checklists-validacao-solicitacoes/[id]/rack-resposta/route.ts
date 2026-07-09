import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isPrivilegedProfile } from '@/lib/auth'
import { ChecklistError, delegate, ensureSolicitacaoEditable } from '@/lib/checklists-validacao'
import { getAuditSession } from '@/lib/audit'

export const runtime = 'nodejs'

type Props = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { id } = await params
  const data = await delegate('checklists_validacao_racks_respostas').findUnique({ where: { checklist_validacao_solicitacao_id: id } })
  return NextResponse.json(data)
}

export async function POST(request: Request, { params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  try {
    const { id } = await params
    const body = await request.json()
    const { usuario_id, usuario_nome } = await getAuditSession()
    const solicitacao = await ensureSolicitacaoEditable(id, { id: usuario_id, nome: usuario_nome }, isPrivilegedProfile((session.user as any)?.perfil))
    if (solicitacao.tipo_solicitacao !== 'RACK') throw new ChecklistError('Resposta permitida apenas para solicitação de rack')
    const data = await delegate('checklists_validacao_racks_respostas').upsert({
      where: { checklist_validacao_solicitacao_id: id },
      create: {
        checklist_validacao_solicitacao_id: id,
        rack_id: solicitacao.rack_id,
        dados_informados_json: body?.dados_informados_json ?? body?.dados ?? {},
        observacoes: body?.observacoes ?? null,
        preenchido_por: usuario_id,
        preenchido_em: new Date(),
      },
      update: {
        dados_informados_json: body?.dados_informados_json ?? body?.dados ?? {},
        observacoes: body?.observacoes ?? null,
        preenchido_por: usuario_id,
        preenchido_em: new Date(),
        atualizado_em: new Date(),
      },
    })
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof ChecklistError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[POST /api/checklists-validacao-solicitacoes/[id]/rack-resposta]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
