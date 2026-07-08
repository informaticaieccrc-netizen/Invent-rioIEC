import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { delegate } from '@/lib/checklists-validacao'
import { getAuditSession, registrarAuditoria } from '@/lib/audit'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const limit = Math.max(1, Math.min(10000, Number(searchParams.get('limit') || 20)))
  const search = (searchParams.get('search') || '').trim()
  const setorId = searchParams.get('setor_id') || ''
  const localidadeId = searchParams.get('localidade_id') || ''
  const status = searchParams.get('status') || ''
  const origem = searchParams.get('origem') || ''
  const alocacao = searchParams.get('alocacao') || ''
  const sort = searchParams.get('sort') || 'criado_em'
  const dir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc'
  const orderField = ['patrimonio', 'marca', 'modelo', 'status', 'criado_em', 'checklist_revisado_em'].includes(sort) ? sort : 'criado_em'
  const where: Record<string, any> = { AND: [] }
  if (search) {
    where.AND.push({
      OR: [
        { codigo_interno: { contains: search, mode: 'insensitive' } },
        { patrimonio: { contains: search, mode: 'insensitive' } },
        { serial: { contains: search, mode: 'insensitive' } },
        { marca: { contains: search, mode: 'insensitive' } },
        { modelo: { contains: search, mode: 'insensitive' } },
        { alocacoes: { some: { ativo: true, maquina: { nome_host: { contains: search, mode: 'insensitive' } } } } },
        { alocacoes: { some: { ativo: true, maquina: { patrimonio_cpu: { contains: search, mode: 'insensitive' } } } } },
        { alocacoes: { some: { ativo: true, maquina: { endereco_ip: { contains: search, mode: 'insensitive' } } } } },
      ],
    })
  }
  if (setorId) {
    where.AND.push({
      alocacoes: {
        some: {
          ativo: true,
          OR: [
            { setor_id: setorId },
            { maquina: { setor_id: setorId } },
          ],
        },
      },
    })
  }
  if (localidadeId) {
    where.AND.push({ alocacoes: { some: { ativo: true, maquina: { localidade_id: localidadeId } } } })
  }
  if (status) where.AND.push({ status })
  if (origem === 'checklist') where.AND.push({ criado_via_checklist: true })
  if (origem === 'manual') where.AND.push({ criado_via_checklist: false })
  if (alocacao === 'alocado') where.AND.push({ alocacoes: { some: { ativo: true } } })
  if (alocacao === 'livre') where.AND.push({ NOT: { alocacoes: { some: { ativo: true } } } })
  if (where.AND.length === 0) delete where.AND
  const [data, total] = await Promise.all([
    delegate('monitores').findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [orderField]: dir },
      include: {
        alocacoes: {
          where: { ativo: true },
          include: {
            maquina: {
              include: {
                setor_rel: true,
                localidade_rel: true,
                alocacoes: {
                  where: { ativo: true },
                  include: {
                    colaborador: {
                      include: {
                        setor_rel: true,
                        localidade_rel: true,
                      },
                    },
                  },
                },
              },
            },
            setor: true,
          },
        },
      },
    }),
    delegate('monitores').count({ where }),
  ])
  const normalized = data.map((monitor: any) => {
    const active = monitor.alocacoes?.[0] ?? null
    const setor = active?.setor ?? active?.maquina?.setor_rel ?? null
    const localidade = active?.maquina?.localidade_rel ?? null
    const colaboradores = (active?.maquina?.alocacoes ?? [])
      .map((alocacao: any) => alocacao.colaborador)
      .filter(Boolean)
    return {
      ...monitor,
      status_text: monitor.status ?? null,
      status: null,
      alocacao_ativa: active,
      setor_id: setor?.id ?? active?.setor_id ?? active?.maquina?.setor_id ?? null,
      setor_nome: setor?.nome ?? null,
      localidade_id: localidade?.id ?? active?.maquina?.localidade_id ?? null,
      localidade_nome: localidade?.nome ?? null,
      maquina_id: active?.maquina_id ?? null,
      maquina_nome: active?.maquina?.nome_host ?? null,
      maquina_patrimonio: active?.maquina?.patrimonio_cpu ?? null,
      maquina_ip: active?.maquina?.endereco_ip ?? null,
      colaboradores,
      colaboradores_nomes: colaboradores.map((colaborador: any) => colaborador.nome).filter(Boolean),
      colaboradores_resumo: colaboradores.map((colaborador: any) => colaborador.nome).filter(Boolean).join(', '),
      data_revisao: monitor.checklist_revisado_em ?? null,
    }
  })
  return NextResponse.json({ data: normalized, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { usuario_id, usuario_nome } = await getAuditSession()
  const body = await request.json()
  const monitor = await delegate('monitores').create({
    data: {
      codigo_interno: body?.codigo_interno ?? null,
      patrimonio: body?.patrimonio ?? null,
      serial: body?.serial ?? null,
      marca: body?.marca ?? null,
      modelo: body?.modelo ?? null,
      status: body?.status ?? 'ativo',
      criado_via_checklist: Boolean(body?.criado_via_checklist),
      criado_por: usuario_id,
    },
  })
  await registrarAuditoria({
    tabela: 'monitores',
    registro_id: monitor.id,
    acao: 'CREATE',
    descricao: `Monitor "${monitor.codigo_interno ?? monitor.patrimonio ?? monitor.id}" criado`,
    dados_novos: monitor,
    usuario_id,
    usuario_nome,
  })
  return NextResponse.json(monitor, { status: 201 })
}
