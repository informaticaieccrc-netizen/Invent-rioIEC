import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { delegate, sanitizeSolicitacao } from '@/lib/checklists-validacao'

export const runtime = 'nodejs'

type Props = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { id } = await params
  const data = await delegate('checklists_validacao_solicitacoes').findMany({
    where: { checklist_validacao_id: id },
    orderBy: [{ tipo_solicitacao: 'asc' }, { criado_em: 'asc' }],
    include: {
      setor: { select: { id: true, nome: true } },
      rack: { select: { id: true, nome_switch: true, localizacao: true } },
      tecnico: { select: { id: true, nome: true, email: true } },
      revisor: { select: { id: true, nome: true } },
      _count: { select: { itens: true, diffs: true } },
    },
  })
  return NextResponse.json({ data: data.map(sanitizeSolicitacao) })
}
