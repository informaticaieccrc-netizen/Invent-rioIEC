import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

function parseDateParam(value: string | null, endOfDay = false) {
  if (!value) return null
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  if (!endOfDay) date.setHours(0, 0, 0, 0)
  if (endOfDay) date.setHours(23, 59, 59, 999)
  return date
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const inicio = parseDateParam(searchParams.get('inicio'))
    const fim = parseDateParam(searchParams.get('fim'), true)
    const where = inicio || fim
      ? {
          criado_em: {
            ...(inicio ? { gte: inicio } : {}),
            ...(fim ? { lte: fim } : {}),
          },
        }
      : {}

    const totals = await prisma.solicitacoes_snow.aggregate({
      where,
      _count: { _all: true },
      _sum: {
        total_recebido: true,
        total_atendidas: true,
        total_nao_atendidas: true,
        total_quarentena: true,
        total_inconsistentes: true,
      },
    })

    const byType = await prisma.solicitacoes_snow.groupBy({
      by: ['tipo_arquivo'],
      where,
      _count: { _all: true },
      _sum: { total_recebido: true },
    })

    const itemWhere = {
      ...(inicio || fim
        ? {
            criado_em: {
              ...(inicio ? { gte: inicio } : {}),
              ...(fim ? { lte: fim } : {}),
            },
          }
        : {}),
      status: { in: ['atendida', 'inconsistente'] },
    }

    const [plannerPendentes, plannerEmAtendimento, plannerResolvidas, inconsistentesAbertas] = await Promise.all([
      prisma.solicitacoes_snow_itens.count({
        where: {
          ...itemWhere,
          planner_status: 'pendente',
        },
      }),
      prisma.solicitacoes_snow_itens.count({
        where: {
          ...itemWhere,
          planner_status: 'assumido',
        },
      }),
      prisma.solicitacoes_snow_itens.count({
        where: {
          ...itemWhere,
          planner_status: 'concluido',
        },
      }),
      prisma.solicitacoes_snow_itens.count({
        where: {
          ...(inicio || fim
            ? {
                criado_em: {
                  ...(inicio ? { gte: inicio } : {}),
                  ...(fim ? { lte: fim } : {}),
                },
              }
            : {}),
          status: 'inconsistente',
          planner_status: { not: 'concluido' },
        },
      }),
    ])

    const atendidas = totals._sum.total_atendidas ?? 0
    const inconsistentesTotais = totals._sum.total_inconsistentes ?? 0

    return NextResponse.json({
      total_solicitacoes: totals._count._all ?? 0,
      total_itens: totals._sum.total_recebido ?? 0,
      atendidas,
      encontradas: atendidas + inconsistentesTotais,
      nao_atendidas: totals._sum.total_nao_atendidas ?? 0,
      em_quarentena: totals._sum.total_quarentena ?? 0,
      inconsistentes: inconsistentesAbertas,
      planner_pendentes: plannerPendentes,
      planner_em_atendimento: plannerEmAtendimento,
      planner_resolvidas: plannerResolvidas,
      por_tipo: byType,
    })
  } catch (error) {
    console.error('[GET /api/snow/overview]', error)
    return NextResponse.json({
      total_solicitacoes: 0,
      total_itens: 0,
      atendidas: 0,
      nao_atendidas: 0,
      em_quarentena: 0,
      inconsistentes: 0,
      planner_pendentes: 0,
      planner_em_atendimento: 0,
      planner_resolvidas: 0,
      por_tipo: [],
    }, { status: 500 })
  }
}
