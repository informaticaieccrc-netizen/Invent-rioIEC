import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
type Props = { params: Promise<{ "registro-id": string }> }

// Mapeia tabela principal para tabelas de alocação relacionadas
const TABELAS_RELACIONADAS: Record<string, string[]> = {
  maquinas: ['maquinas', 'alocacoes_maquinas'],
  notebooks: ['notebooks', 'alocacoes_notebooks'],
  aparelhos: ['aparelhos', 'alocacoes_aparelhos'],
  ramais: ['ramais', 'alocacoes_ramais'],
  impressoras: ['impressoras'],
  racks: ['racks'],
  colaboradores: ['colaboradores', 'alocacoes_maquinas', 'alocacoes_notebooks', 'alocacoes_aparelhos', 'alocacoes_ramais'],
  solicitacoes: ['solicitacoes'],
}

async function idsRelacionados(tabela: string, registroId: string) {
  if (tabela === 'maquinas') {
    const rows = await prisma.alocacoes_maquinas.findMany({ where: { maquina_id: registroId }, select: { id: true } })
    return rows.map(row => row.id)
  }
  if (tabela === 'notebooks') {
    const rows = await prisma.alocacoes_notebooks.findMany({ where: { notebook_id: registroId }, select: { id: true } })
    return rows.map(row => row.id)
  }
  if (tabela === 'aparelhos') {
    const rows = await prisma.alocacoes_aparelhos.findMany({ where: { aparelho_id: registroId }, select: { id: true } })
    return rows.map(row => row.id)
  }
  if (tabela === 'ramais') {
    const rows = await prisma.alocacoes_ramais.findMany({ where: { ramal_id: registroId }, select: { id: true } })
    return rows.map(row => row.id)
  }
  if (tabela === 'colaboradores') {
    const [maquinas, notebooks, aparelhos, ramais] = await Promise.all([
      prisma.alocacoes_maquinas.findMany({ where: { colaborador_id: registroId }, select: { id: true } }),
      prisma.alocacoes_notebooks.findMany({ where: { colaborador_id: registroId }, select: { id: true } }),
      prisma.alocacoes_aparelhos.findMany({ where: { colaborador_id: registroId }, select: { id: true } }),
      prisma.alocacoes_ramais.findMany({ where: { colaborador_id: registroId }, select: { id: true } }),
    ])
    return [
      ...maquinas.map(row => row.id),
      ...notebooks.map(row => row.id),
      ...aparelhos.map(row => row.id),
      ...ramais.map(row => row.id),
    ].filter((id): id is string => Boolean(id))
  }
  return []
}

async function ativoIdsDoColaborador(registroId: string) {
  const [maquinas, notebooks, aparelhos, ramais] = await Promise.all([
    prisma.alocacoes_maquinas.findMany({ where: { colaborador_id: registroId }, select: { maquina_id: true } }),
    prisma.alocacoes_notebooks.findMany({ where: { colaborador_id: registroId }, select: { notebook_id: true } }),
    prisma.alocacoes_aparelhos.findMany({ where: { colaborador_id: registroId }, select: { aparelho_id: true } }),
    prisma.alocacoes_ramais.findMany({ where: { colaborador_id: registroId }, select: { ramal_id: true } }),
  ])
  return [
    ...maquinas.map(row => row.maquina_id),
    ...notebooks.map(row => row.notebook_id),
    ...aparelhos.map(row => row.aparelho_id),
    ...ramais.map(row => row.ramal_id),
  ].filter((id): id is string => Boolean(id))
}

function payloadDoLogTemColaborador(log: { dados_anteriores: unknown; dados_novos: unknown }, colaboradorId: string) {
  const hasColaborador = (value: unknown): boolean => {
    if (!value || typeof value !== 'object') return false
    if (Array.isArray(value)) return value.some(hasColaborador)
    const record = value as Record<string, unknown>
    if (record.colaborador_id === colaboradorId) return true
    return Object.values(record).some(hasColaborador)
  }
  return hasColaborador(log.dados_anteriores) || hasColaborador(log.dados_novos)
}

export async function GET(request: Request, { params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { "registro-id": registro_id } = await params
  const { searchParams } = new URL(request.url)
  const tabela = searchParams.get('tabela') || ''

  const tabelasFiltro = tabela
    ? (TABELAS_RELACIONADAS[tabela] ?? [tabela])
    : undefined
  const registroIds = Array.from(new Set([registro_id, ...(await idsRelacionados(tabela, registro_id))]))

  const where: any = {
    registro_id: { in: registroIds },
    ...(tabelasFiltro ? { tabela: { in: tabelasFiltro } } : {}),
  }

  const logsBase = await prisma.audit_log.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: 100,
  })

  if (tabela !== 'colaboradores') return NextResponse.json(logsBase)

  const ativoIds = await ativoIdsDoColaborador(registro_id)
  const logsPorAtivo = ativoIds.length > 0
    ? await prisma.audit_log.findMany({
        where: {
          registro_id: { in: ativoIds },
          tabela: { in: ['alocacoes_maquinas', 'alocacoes_notebooks', 'alocacoes_aparelhos', 'alocacoes_ramais'] },
        },
        orderBy: { created_at: 'desc' },
        take: 100,
      })
    : []
  const dedupe = new Map<string, (typeof logsBase)[number]>()
  for (const log of [...logsBase, ...logsPorAtivo.filter(log => payloadDoLogTemColaborador(log, registro_id))]) {
    dedupe.set(log.id, log)
  }
  const logs = Array.from(dedupe.values())
    .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
    .slice(0, 100)

  return NextResponse.json(logs)
}
