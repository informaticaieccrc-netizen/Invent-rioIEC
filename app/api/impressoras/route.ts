import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Prisma } from '@prisma/client'
import { authOptions, requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { registrarAuditoria, getAuditSession } from '@/lib/audit'
import { withLocalidadePadrao } from '@/lib/localidades'

export const runtime = 'nodejs'

function parseSetorIds(value: string) {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function normalizeImpressoraPayload(data: Record<string, unknown>) {
  if (typeof data.revisao === 'string' && data.revisao) {
    return { ...data, revisao: new Date(`${data.revisao}T00:00:00.000Z`) }
  }
  if (data.revisao === '' || data.revisao === null) return { ...data, revisao: null }
  return data
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const page    = Math.max(1, parseInt(searchParams.get('page')  || '1', 10))
    const limit   = Math.max(1, Math.min(10000, parseInt(searchParams.get('limit') || '20', 10)))
    const search  = (searchParams.get('search') || '').trim()
    const setorId = searchParams.get('setor_id') || ''
    const setorIds = parseSetorIds(setorId)
    const localidadeId = searchParams.get('localidade_id') || ''
    const localidadeIds = parseSetorIds(localidadeId)
    const andar   = (searchParams.get('andar') || '').trim()
    const status  = searchParams.get('status') || ''
    const sort    = searchParams.get('sort')     || 'modelo'
    const dir     = searchParams.get('dir') === 'desc' ? 'desc' : 'asc'

    const validSortFields: Record<string, boolean> = {
      modelo: true, fabricante: true, andar: true, numero_serie: true, nome_host: true, revisao: true, created_at: true,
    }
    const safeSort = validSortFields[sort] ? sort : 'modelo'

    const AND: Prisma.impressorasWhereInput[] = []

    if (search) {
      AND.push({
        OR: [
          { modelo:      { contains: search, mode: 'insensitive' } },
          { fabricante:  { contains: search, mode: 'insensitive' } },
          { localidade:  { contains: search, mode: 'insensitive' } },
          { endereco_ip: { contains: search, mode: 'insensitive' } },
          { numero_serie: { contains: search, mode: 'insensitive' } },
          { identificador_selb: { contains: search, mode: 'insensitive' } },
          { setor_rel: { nome: { contains: search, mode: 'insensitive' } } },
          { localidade_rel: { nome: { contains: search, mode: 'insensitive' } } },
        ],
      })
    }

    if (setorIds.length === 1) AND.push({ setor_id: setorIds[0] })
    if (setorIds.length > 1) AND.push({ setor_id: { in: setorIds } })
    if (localidadeIds.length === 1) AND.push({ localidade_id: localidadeIds[0] })
    if (localidadeIds.length > 1) AND.push({ localidade_id: { in: localidadeIds } })
    if (andar) AND.push({ andar: { contains: andar, mode: 'insensitive' } })
    if (status === 'true') AND.push({ status: true })
    if (status === 'false') AND.push({ status: false })

    const where: Prisma.impressorasWhereInput = AND.length > 0 ? { AND } : {}
    const orderBy = { [safeSort]: dir }

    const [data, total] = await Promise.all([
      prisma.impressoras.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        include: {
          setor_rel: { select: { id: true, nome: true } },
          localidade_rel: { select: { id: true, nome: true } },
        },
      }),
      prisma.impressoras.count({ where }),
    ])

    const mapped = data.map((i) => ({
      ...i,
      setor_nome: i.setor_rel?.nome ?? i.localidade ?? null,
      localidade_nome: i.localidade_rel?.nome ?? i.localidade ?? null,
    }))

    return NextResponse.json({ data: mapped, total, page, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    console.error('[GET /api/impressoras]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Erro interno', data: [], total: 0, page: 1, totalPages: 1 }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { usuario_id, usuario_nome } = await getAuditSession()
    const body = await request.json()
    const data = await withLocalidadePadrao(normalizeImpressoraPayload(body))
    const item = await prisma.impressoras.create({ data })

    await registrarAuditoria({
      tabela: 'impressoras',
      registro_id: item.id,
      acao: 'CREATE',
      descricao: `Impressora "${item.nome_host ?? item.numero_serie ?? item.id}" criada`,
      dados_novos: item as unknown as Record<string, unknown>,
      usuario_id,
      usuario_nome,
    })

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error('[POST /api/impressoras]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
