import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { delegate, ChecklistError } from '@/lib/checklists-validacao'
import { getAuditSession, registrarAuditoria } from '@/lib/audit'
import { notifyChecklistSolicitacaoStatus } from '@/lib/checklist/power-automate'
import { isChecklistIntegrationAuthorized } from '@/lib/checklist/auth'
import { plannerAtribuirSolicitacao } from '@/lib/checklist/planner'
import { ensureChecklistTecnicoApto } from '@/lib/checklist/tecnico'

export const runtime = 'nodejs'

type Props = { params: Promise<{ id: string }> }

function tokenSource(request: Request) {
  if (request.headers.get('authorization')?.toLowerCase().startsWith('bearer ')) return 'bearer'
  if (request.headers.get('x-api-key')) return 'x-api-key'
  return 'none'
}

function maskCode(value: unknown) {
  if (value == null) return null
  const text = String(value).trim()
  if (!text) return null
  return `***${text.slice(-4)}`
}

function payloadSummary(payload: any) {
  const solicitacao = payload?.solicitacao ?? {}
  const cardPlanner = payload?.card_planner ?? {}
  return {
    keys: payload && typeof payload === 'object' ? Object.keys(payload) : [],
    has_planner_task_id: Boolean(payload?.planner_task_id ?? cardPlanner?.planner_task_id ?? cardPlanner?.planner_id),
    has_tecnico_nome: Boolean(payload?.tecnico_nome ?? solicitacao?.responsavel_nome),
    has_tecnico_email: Boolean(payload?.tecnico_email ?? solicitacao?.responsavel_email),
    tecnico_codigo_pessoa: maskCode(payload?.tecnico_codigo_pessoa ?? solicitacao?.responsavel_codPessoa ?? solicitacao?.responsavel_codigo_pessoa),
    atribuido_em: payload?.atribuido_em ?? solicitacao?.atribuido_em ?? null,
  }
}

function logIntegration(event: string, details: Record<string, unknown>, level: 'info' | 'warn' | 'error' = 'info') {
  const line = JSON.stringify({
    scope: 'checklist.integration',
    route: 'checklists-validacao-solicitacoes.assumir',
    event,
    ...details,
  })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

async function handleExternalAssumir(request: Request, { params }: Props) {
  const { id } = await params
  const payload = await request.json().catch(() => ({}))
  const requestId = request.headers.get('x-vercel-id') ?? request.headers.get('x-ms-correlation-id') ?? null
  logIntegration('received', {
    solicitacao_id: id,
    method: request.method,
    request_id: requestId,
    auth: tokenSource(request),
    payload: payloadSummary(payload),
  })
  try {
    const result = await plannerAtribuirSolicitacao(id, payload)
    logIntegration('success', {
      solicitacao_id: id,
      request_id: requestId,
      status: result.status,
      planner_status: result.planner_status,
      has_planner_task_id: Boolean(result.planner_task_id),
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ChecklistError) {
      logIntegration('rejected', {
        solicitacao_id: id,
        request_id: requestId,
        status: error.status,
        error: error.message,
        payload: payloadSummary(payload),
      }, 'warn')
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    logIntegration('failed', { solicitacao_id: id, request_id: requestId, error }, 'error')
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

async function handleInternalAssumir({ params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  try {
    const { id } = await params
    const { usuario_id, usuario_nome } = await getAuditSession()
    await ensureChecklistTecnicoApto(usuario_id)
    const atual = await delegate('checklists_validacao_solicitacoes').findUnique({ where: { id } })
    if (!atual) throw new ChecklistError('Solicitação não encontrada', 404)
    if (atual.assumido_por && atual.assumido_por !== usuario_id) throw new ChecklistError('Solicitação já assumida por outro técnico', 409)
    const solicitacao = await delegate('checklists_validacao_solicitacoes').update({
      where: { id },
      data: { status: 'assumida', assumido_por: usuario_id, assumido_em: atual.assumido_em ?? new Date(), atualizado_em: new Date() },
    })
    await registrarAuditoria({
      tabela: 'checklists_validacao_solicitacoes',
      registro_id: id,
      acao: 'UPDATE',
      descricao: 'Solicitação assumida pela interface do inventário',
      dados_anteriores: atual,
      dados_novos: solicitacao,
      usuario_id,
      usuario_nome,
    })
    await notifyChecklistSolicitacaoStatus(id, 'solicitacao_assumida')
    return NextResponse.json(solicitacao)
  } catch (error) {
    if (error instanceof ChecklistError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[PATCH /api/checklists-validacao-solicitacoes/[id]/assumir]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function PATCH(request: Request, props: Props) {
  if (isChecklistIntegrationAuthorized(request)) return handleExternalAssumir(request, props)
  return handleInternalAssumir(props)
}

export async function POST(request: Request, props: Props) {
  if (isChecklistIntegrationAuthorized(request)) return handleExternalAssumir(request, props)
  return handleInternalAssumir(props)
}
