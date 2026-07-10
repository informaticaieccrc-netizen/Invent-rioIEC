import { delegate, ChecklistError, sanitizeSolicitacao } from '@/lib/checklists-validacao'
import { registrarAuditoria } from '@/lib/audit'
import { prisma } from '@/lib/prisma'

function text(value: unknown) {
  if (value == null) return null
  const str = String(value).trim()
  return str || null
}

function dateOrNow(value: unknown) {
  const raw = text(value)
  if (!raw) return new Date()
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) throw new ChecklistError('Data inválida')
  return date
}

export async function findTecnico(payload: any) {
  const email = text(payload?.tecnico_email)
  const codigo = text(payload?.tecnico_codigo_pessoa)
  const nome = text(payload?.tecnico_nome)
  if (email) {
    const user = await prisma.usuarios.findFirst({ where: { email, ativo: true } })
    if (user) return user
  }
  if (codigo) {
    const user = await prisma.usuarios.findFirst({ where: { codigo_pessoa: codigo, ativo: true } })
    if (user) return user
  }
  if (nome) {
    const user = await prisma.usuarios.findFirst({ where: { nome: { equals: nome, mode: 'insensitive' }, ativo: true } })
    if (user) return user
  }
  return null
}

export async function plannerAtribuirSolicitacao(id: string, payload: any) {
  const tecnicoNome = text(payload?.tecnico_nome)
  if (!tecnicoNome) throw new ChecklistError('tecnico_nome é obrigatório')
  const atual = await delegate('checklists_validacao_solicitacoes').findUnique({
    where: { id },
    include: { tecnico: true, setor: true, rack: true, _count: { select: { itens: true, diffs: true } } },
  })
  if (!atual) throw new ChecklistError('Solicitação não encontrada', 404)
  const tecnico = await findTecnico(payload)
  if (atual.assumido_por && tecnico?.id && atual.assumido_por !== tecnico.id) {
    throw new ChecklistError('Solicitação já assumida por outro técnico no inventário', 409)
  }
  const data: Record<string, unknown> = {
    planner_status: 'assumido',
    planner_task_id: text(payload?.planner_task_id) ?? atual.planner_task_id,
    planner_atualizado_em: new Date(),
    atualizado_em: new Date(),
  }
  if (!atual.assumido_por && tecnico?.id) {
    data.status = 'assumida'
    data.assumido_por = tecnico.id
    data.assumido_em = dateOrNow(payload?.atribuido_em)
  }
  const solicitacao = await delegate('checklists_validacao_solicitacoes').update({
    where: { id },
    data,
    include: { tecnico: true, setor: true, rack: true, _count: { select: { itens: true, diffs: true } } },
  })
  return sanitizeSolicitacao(solicitacao)
}

export async function plannerVincularSolicitacao(id: string, payload: any) {
  const plannerTaskId = text(payload?.planner_task_id)
  if (!plannerTaskId) throw new ChecklistError('planner_task_id é obrigatório')

  const atual = await delegate('checklists_validacao_solicitacoes').findUnique({
    where: { id },
    include: { tecnico: true, setor: true, rack: true, _count: { select: { itens: true, diffs: true } } },
  })
  if (!atual) throw new ChecklistError('Solicitação não encontrada', 404)
  if (atual.planner_task_id && atual.planner_task_id !== plannerTaskId) {
    throw new ChecklistError('Solicitação já vinculada a outro ID do Planner', 409)
  }

  const solicitacao = await delegate('checklists_validacao_solicitacoes').update({
    where: { id },
    data: {
      planner_task_id: plannerTaskId,
      planner_atualizado_em: new Date(),
      atualizado_em: new Date(),
    },
    include: { tecnico: true, setor: true, rack: true, _count: { select: { itens: true, diffs: true } } },
  })

  await registrarAuditoria({
    tabela: 'checklists_validacao_solicitacoes',
    registro_id: id,
    acao: 'UPDATE',
    descricao: atual.planner_task_id
      ? 'ID do Planner confirmado pela integração Checklist'
      : 'ID do Planner vinculado pela integração Checklist',
    dados_anteriores: { planner_task_id: atual.planner_task_id, planner_status: atual.planner_status },
    dados_novos: { planner_task_id: plannerTaskId, planner_status: solicitacao.planner_status },
    usuario_id: null,
    usuario_nome: text(payload?.origem) ?? 'Power Automate',
  })

  return sanitizeSolicitacao(solicitacao)
}

export async function plannerConcluirSolicitacao(id: string, payload: any) {
  const atual = await delegate('checklists_validacao_solicitacoes').findUnique({ where: { id }, include: { rack_resposta: true, _count: { select: { itens: true } } } })
  if (!atual) throw new ChecklistError('Solicitação não encontrada', 404)
  const podeFinalizarInterno = atual.tipo_solicitacao === 'SETOR'
    ? atual._count.itens > 0
    : Boolean(atual.rack_resposta)
  const solicitacao = await delegate('checklists_validacao_solicitacoes').update({
    where: { id },
    data: {
      planner_status: 'concluido',
      planner_task_id: text(payload?.planner_task_id) ?? atual.planner_task_id,
      planner_atualizado_em: new Date(),
      status: podeFinalizarInterno && atual.status !== 'revisada' ? 'finalizada' : atual.status,
      finalizado_em: podeFinalizarInterno ? (atual.finalizado_em ?? dateOrNow(payload?.concluido_em)) : atual.finalizado_em,
      atualizado_em: new Date(),
    },
    include: { tecnico: true, setor: true, rack: true, _count: { select: { itens: true, diffs: true } } },
  })
  return sanitizeSolicitacao(solicitacao)
}
