import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { calcularCoberturaSolicitacao, delegate, sanitizeSolicitacao } from '@/lib/checklists-validacao'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || ''
    const revisao = searchParams.get('revisao') || ''
    const page = Math.max(1, Number(searchParams.get('page') || 1))
    const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit') || 50)))

    const where: Record<string, unknown> = {}
    if (status) where.status = { in: status.split(',').map(item => item.trim()).filter(Boolean) }
    if (revisao) where.status_revisao = { in: revisao.split(',').map(item => item.trim()).filter(Boolean) }

    const [rows, total] = await Promise.all([
      delegate('checklists_validacao_solicitacoes').findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ atualizado_em: 'desc' }, { criado_em: 'desc' }],
        include: {
          checklist: { include: { localidade: { select: { id: true, nome: true } } } },
          setor: { select: { id: true, nome: true } },
          rack: { select: { id: true, nome_switch: true, localizacao: true, quantidade_portas: true } },
          tecnico: { select: { id: true, nome: true, email: true } },
          revisor: { select: { id: true, nome: true } },
          _count: { select: { itens: true, diffs: true } },
        },
      }),
      delegate('checklists_validacao_solicitacoes').count({ where }),
    ])

    const solicitacaoIds = rows.map((row: any) => row.id)
    const assimilationAudits = solicitacaoIds.length
      ? await delegate('audit_log').findMany({
        where: {
          tabela: 'checklists_validacao_solicitacoes',
          registro_id: { in: solicitacaoIds },
          acao: 'APROVAR',
          OR: [
            { descricao: { contains: 'assimilado', mode: 'insensitive' } },
            { descricao: { contains: 'assimilados', mode: 'insensitive' } },
          ],
        },
        orderBy: { created_at: 'desc' },
      })
      : []
    const auditBySolicitacao = new Map<string, any>()
    for (const audit of assimilationAudits) {
      if (!auditBySolicitacao.has(audit.registro_id)) auditBySolicitacao.set(audit.registro_id, audit)
    }

    const data = await Promise.all(rows.map(async (row: any) => {
      const assimilationAudit = auditBySolicitacao.get(row.id)
      return sanitizeSolicitacao({
        ...row,
        assimilada: Boolean(assimilationAudit),
        assimilado_por_nome: assimilationAudit?.usuario_nome ?? null,
        assimilado_em: assimilationAudit?.created_at ?? null,
        checklist_nome: row.checklist?.nome ?? null,
        localidade_nome: row.checklist?.localidade?.nome ?? null,
        cobertura: await calcularCoberturaSolicitacao(row),
      })
    }))

    return NextResponse.json({ data, total, page, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    console.error('[GET /api/checklists-validacao-solicitacoes]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
