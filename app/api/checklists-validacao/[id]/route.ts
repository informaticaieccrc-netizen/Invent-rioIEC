import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { calcularCoberturaSolicitacao, delegate, sanitizeSolicitacao } from '@/lib/checklists-validacao'

export const runtime = 'nodejs'

type Props = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Props) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const { id } = await params
    const checklist = await delegate('checklists_validacao').findUnique({
      where: { id },
      include: {
        localidade: { select: { id: true, nome: true } },
        solicitacoes: {
          orderBy: [{ tipo_solicitacao: 'asc' }, { criado_em: 'asc' }],
          include: {
            setor: { select: { id: true, nome: true } },
            rack: { select: { id: true, nome_switch: true, localizacao: true } },
            tecnico: { select: { id: true, nome: true, email: true } },
            revisor: { select: { id: true, nome: true } },
            itens: { orderBy: { preenchido_em: 'desc' }, take: 1, select: { preenchido_em: true } },
            rack_resposta: { select: { preenchido_em: true } },
            _count: { select: { itens: true, diffs: true } },
          },
        },
      },
    })
    if (!checklist) return NextResponse.json({ error: 'Checklist não encontrado' }, { status: 404 })
    const solicitacoes = await Promise.all(checklist.solicitacoes.map(async (solicitacao: any) => ({
      ...solicitacao,
      ultimo_preenchimento_em: solicitacao.itens?.[0]?.preenchido_em ?? solicitacao.rack_resposta?.preenchido_em ?? null,
      cobertura: await calcularCoberturaSolicitacao({ ...solicitacao, checklist }),
    })))

    return NextResponse.json({
      ...checklist,
      localidade_nome: checklist.localidade?.nome ?? null,
      solicitacoes: solicitacoes.map(sanitizeSolicitacao),
    })
  } catch (error) {
    console.error('[GET /api/checklists-validacao/[id]]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
