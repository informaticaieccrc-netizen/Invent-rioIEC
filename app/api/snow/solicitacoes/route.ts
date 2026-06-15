import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { TIPOS_RELATORIO_SNOW } from '@/lib/snow/types'

export const runtime = 'nodejs'

const STATUS_PROCESSAMENTO = new Set(['processado', 'erro_processamento'])

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
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '20', 10)))
    const tipo = searchParams.get('tipo') || ''
    const status = searchParams.get('status') || ''
    const q = (searchParams.get('q') || '').trim()
    const inicio = parseDateParam(searchParams.get('inicio'))
    const fim = parseDateParam(searchParams.get('fim'), true)

    const where: any = {}
    if ((TIPOS_RELATORIO_SNOW as readonly string[]).includes(tipo)) where.tipo_arquivo = tipo
    if (STATUS_PROCESSAMENTO.has(status)) where.status_processamento = status
    if (inicio || fim) {
      where.criado_em = {
        ...(inicio ? { gte: inicio } : {}),
        ...(fim ? { lte: fim } : {}),
      }
    }
    if (q) {
      where.OR = [
        { nome_arquivo: { contains: q, mode: 'insensitive' } },
        { origem_email: { contains: q, mode: 'insensitive' } },
        { assunto_email: { contains: q, mode: 'insensitive' } },
        { itens: { some: { ip: { contains: q, mode: 'insensitive' } } } },
        { itens: { some: { hostname: { contains: q, mode: 'insensitive' } } } },
      ]
    }

    const [data, total] = await Promise.all([
      prisma.solicitacoes_snow.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { criado_em: 'desc' },
      }),
      prisma.solicitacoes_snow.count({ where }),
    ])

    const ids = data.map(item => item.id)
    const plannerGroups = ids.length > 0
      ? await prisma.solicitacoes_snow_itens.groupBy({
          by: ['solicitacao_snow_id', 'status', 'planner_status'],
          where: {
            solicitacao_snow_id: { in: ids },
            status: { in: ['atendida', 'inconsistente'] },
          },
          _count: { _all: true },
        })
      : []
    const plannerBySolicitacao = plannerGroups.reduce((map, group) => {
      const current = map.get(group.solicitacao_snow_id) ?? {
        total_operacional: 0,
        planner_pendentes: 0,
        planner_em_atendimento: 0,
        planner_concluidas: 0,
        planner_abertas: 0,
        total_inconsistentes_abertas: 0,
      }

      current.total_operacional += group._count._all
      if (group.planner_status === 'concluido') current.planner_concluidas += group._count._all
      else {
        current.planner_abertas += group._count._all
        if (group.planner_status === 'assumido') current.planner_em_atendimento += group._count._all
        else current.planner_pendentes += group._count._all
        if (group.status === 'inconsistente') current.total_inconsistentes_abertas += group._count._all
      }

      map.set(group.solicitacao_snow_id, current)
      return map
    }, new Map<string, { total_operacional: number; planner_pendentes: number; planner_em_atendimento: number; planner_concluidas: number; planner_abertas: number; total_inconsistentes_abertas: number }>())

    const enriched = data.map(item => {
      const counters = plannerBySolicitacao.get(item.id) ?? {
        total_operacional: 0,
        planner_pendentes: 0,
        planner_em_atendimento: 0,
        planner_concluidas: 0,
        planner_abertas: 0,
        total_inconsistentes_abertas: 0,
      }

      return {
        ...item,
        ...counters,
        planner_resolvida: counters.total_operacional > 0 && counters.planner_abertas === 0,
      }
    })

    return NextResponse.json({ data: enriched, total, page, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    console.error('[GET /api/snow/solicitacoes]', error)
    return NextResponse.json({ error: 'Erro interno', data: [], total: 0, page: 1, totalPages: 1 }, { status: 500 })
  }
}
