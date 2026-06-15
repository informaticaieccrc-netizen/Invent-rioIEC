import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

function buildPlannerSummary(itens: Array<{ status: string; planner_status: string | null }>) {
  return itens.reduce((summary, item) => {
    if (item.status !== 'atendida' && item.status !== 'inconsistente') return summary

    summary.total_operacional += 1
    if (item.planner_status === 'concluido') {
      summary.planner_concluidas += 1
      return summary
    }

    summary.planner_abertas += 1
    if (item.planner_status === 'assumido') summary.planner_em_atendimento += 1
    else summary.planner_pendentes += 1
    if (item.status === 'inconsistente') summary.total_inconsistentes_abertas += 1
    return summary
  }, {
    total_operacional: 0,
    planner_pendentes: 0,
    planner_em_atendimento: 0,
    planner_concluidas: 0,
    planner_abertas: 0,
    total_inconsistentes_abertas: 0,
  })
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const { id } = await params
    const item = await prisma.solicitacoes_snow.findUnique({
      where: { id },
      include: {
        itens: {
          orderBy: { criado_em: 'asc' },
          include: {
            solicitacao_snow: {
              select: {
                id: true,
                nome_arquivo: true,
                tipo_arquivo: true,
                origem_email: true,
                recebido_em: true,
                criado_em: true,
              },
            },
            maquina: {
              select: {
                id: true,
                nome_host: true,
                endereco_ip: true,
                identificador: true,
              },
            },
          },
        },
      },
    })

    if (!item) return NextResponse.json({ error: 'Solicitação SNOW não encontrada' }, { status: 404 })

    const plannerSummary = buildPlannerSummary(item.itens)

    const repeatedMachineIds = item.itens
      .filter(snowItem => snowItem.status === 'em_quarentena' && snowItem.maquina_id)
      .map(snowItem => snowItem.maquina_id as string)

    if (repeatedMachineIds.length === 0) {
      return NextResponse.json({
        ...item,
        ...plannerSummary,
        planner_resolvida: plannerSummary.total_operacional > 0 && plannerSummary.planner_abertas === 0,
      })
    }

    const historico = await prisma.solicitacoes_snow_itens.findMany({
      where: {
        maquina_id: { in: repeatedMachineIds },
        status: { in: ['atendida', 'em_quarentena'] },
      },
      orderBy: { criado_em: 'desc' },
      include: {
        solicitacao_snow: {
          select: {
            id: true,
            nome_arquivo: true,
            tipo_arquivo: true,
            origem_email: true,
            recebido_em: true,
            criado_em: true,
          },
        },
      },
    })

    return NextResponse.json({
      ...item,
      ...plannerSummary,
      planner_resolvida: plannerSummary.total_operacional > 0 && plannerSummary.planner_abertas === 0,
      itens: item.itens.map(snowItem => ({
        ...snowItem,
        repeticoes: snowItem.maquina_id
          ? historico.filter(historyItem => historyItem.maquina_id === snowItem.maquina_id)
          : [],
      })),
    })
  } catch (error) {
    console.error('[GET /api/snow/solicitacoes/[id]]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
