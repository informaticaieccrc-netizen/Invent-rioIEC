import { NextResponse } from 'next/server'
import { isChecklistIntegrationAuthorized } from '@/lib/checklist/auth'
import { delegate, sanitizeSolicitacao } from '@/lib/checklists-validacao'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  if (!isChecklistIntegrationAuthorized(request)) {
    return NextResponse.json({ error: 'Token de integração Checklist inválido' }, { status: 401 })
  }
  const data = await delegate('checklists_validacao_solicitacoes').findMany({
    where: { planner_status: 'pendente', planner_task_id: null, status: { in: ['aberta', 'assumida'] } },
    take: 200,
    orderBy: { criado_em: 'asc' },
    include: {
      checklist: { include: { localidade: { select: { nome: true } } } },
      setor: { select: { id: true, nome: true } },
      rack: { select: { id: true, nome_switch: true, localizacao: true } },
      tecnico: { select: { id: true, nome: true, email: true } },
      _count: { select: { itens: true, diffs: true } },
    },
  })
  return NextResponse.json({ data: data.map(sanitizeSolicitacao) })
}
