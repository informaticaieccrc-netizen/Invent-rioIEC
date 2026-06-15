import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

const ITEM_STATUSES = new Set(['atendida', 'nao_atendida', 'em_quarentena', 'inconsistente', 'erro_processamento'])
const PLANNER_STATUSES = new Set(['pendente', 'assumido', 'concluido'])

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
    const status = (searchParams.get('status') || 'atendida,em_quarentena')
      .split(',')
      .map(item => item.trim())
      .filter(item => ITEM_STATUSES.has(item))
    const plannerStatus = (searchParams.get('planner_status') || '')
      .split(',')
      .map(item => item.trim())
      .filter(item => PLANNER_STATUSES.has(item))
    const q = (searchParams.get('q') || '').trim()
    const inicio = parseDateParam(searchParams.get('inicio'))
    const fim = parseDateParam(searchParams.get('fim'), true)

    const where: any = {}
    if (status.length > 0) where.status = { in: status }
    if (plannerStatus.length > 0) where.planner_status = { in: plannerStatus }
    if (status.length === 1 && status[0] === 'inconsistente' && plannerStatus.length === 0) {
      where.planner_status = { not: 'concluido' }
    }
    if (inicio || fim) {
      where.criado_em = {
        ...(inicio ? { gte: inicio } : {}),
        ...(fim ? { lte: fim } : {}),
      }
    }
    if (q) {
      where.OR = [
        { ip: { contains: q, mode: 'insensitive' } },
        { hostname: { contains: q, mode: 'insensitive' } },
        { colaborador_alocado: { contains: q, mode: 'insensitive' } },
        { atendente_nome: { contains: q, mode: 'insensitive' } },
        { atendente_codigo_pessoa: { contains: q, mode: 'insensitive' } },
        { solicitacao_snow: { nome_arquivo: { contains: q, mode: 'insensitive' } } },
      ]
    }

    const [data, total] = await Promise.all([
      prisma.solicitacoes_snow_itens.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
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
          maquina: {
            select: {
              id: true,
              nome_host: true,
              endereco_ip: true,
              identificador: true,
            },
          },
        },
      }),
      prisma.solicitacoes_snow_itens.count({ where }),
    ])

    return NextResponse.json({ data, total, page, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    console.error('[GET /api/snow/itens]', error)
    return NextResponse.json({ error: 'Erro interno', data: [], total: 0, page: 1, totalPages: 1 }, { status: 500 })
  }
}
