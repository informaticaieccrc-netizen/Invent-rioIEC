import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { descricaoDiff, registrarAuditoria, type AuditAction } from '@/lib/audit'
import { withoutLegacyVirtualFields } from '@/lib/payload'
import { deleteArquivo } from '@/lib/supabase-storage'

export const SOLICITACAO_INVENTARIO_STATUS = ['pendente', 'aprovada', 'recusada'] as const
export const SOLICITACAO_INVENTARIO_ACOES = ['CREATE', 'UPDATE', 'DELETE', 'ALLOCATE', 'DEALLOCATE', 'CORRECTION', 'UPLOAD'] as const

export type SolicitacaoInventarioAcao = typeof SOLICITACAO_INVENTARIO_ACOES[number]

type ResourceConfig = {
  delegate: string
  label: string
  alocacao?: boolean
}

type ResourceDelegate = {
  findUnique?: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>
  create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>
  update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<Record<string, unknown>>
  delete: (args: { where: { id: string } }) => Promise<Record<string, unknown>>
}

type SolicitacaoInventarioAplicavel = {
  id: string
  tipo_recurso: string
  recurso_id: string | null
  acao: string
  dados_anteriores: Record<string, unknown> | null
  dados_propostos: Record<string, unknown> | null
}

type SolicitacaoInventarioResponse = SolicitacaoInventarioAplicavel & {
  [key: string]: unknown
}

const ALOCACAO_ASSET_KEYS: Record<string, string> = {
  alocacoes_maquinas: 'maquina_id',
  alocacoes_notebooks: 'notebook_id',
  alocacoes_aparelhos: 'aparelho_id',
  alocacoes_ramais: 'ramal_id',
  alocacoes_monitores: 'monitor_id',
}

export const SOLICITACAO_INVENTARIO_RECURSOS: Record<string, ResourceConfig> = {
  maquinas: { delegate: 'maquinas', label: 'Máquinas' },
  notebooks: { delegate: 'notebooks', label: 'Notebooks' },
  aparelhos: { delegate: 'aparelhos', label: 'Aparelhos' },
  impressoras: { delegate: 'impressoras', label: 'Impressoras' },
  ramais: { delegate: 'ramais', label: 'Ramais' },
  racks: { delegate: 'racks', label: 'Racks' },
  colaboradores: { delegate: 'colaboradores', label: 'Colaboradores' },
  alocacoes_maquinas: { delegate: 'alocacoes_maquinas', label: 'Alocações — Máquinas', alocacao: true },
  alocacoes_notebooks: { delegate: 'alocacoes_notebooks', label: 'Alocações — Notebooks', alocacao: true },
  alocacoes_aparelhos: { delegate: 'alocacoes_aparelhos', label: 'Alocações — Aparelhos', alocacao: true },
  alocacoes_ramais: { delegate: 'alocacoes_ramais', label: 'Alocações — Ramais', alocacao: true },
  alocacoes_monitores: { delegate: 'alocacoes_monitores', label: 'Alocações — Monitores', alocacao: true },
  forum_arquivos: { delegate: 'forum_arquivos', label: 'Documentos do Fórum' },
}

export function normalizarTipoRecurso(tipoRecurso: string) {
  if (tipoRecurso === 'alocacoes') return null
  return SOLICITACAO_INVENTARIO_RECURSOS[tipoRecurso] ? tipoRecurso : null
}

export function getResourceDelegate(tipoRecurso: string) {
  const recurso = SOLICITACAO_INVENTARIO_RECURSOS[tipoRecurso]
  if (!recurso) return null
  return (prisma as unknown as Record<string, ResourceDelegate>)[recurso.delegate] ?? null
}

export function cleanInventarioPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}
  const clean = { ...withoutLegacyVirtualFields(payload as Record<string, unknown>) }
  for (const key of [
    'id',
    'created_at',
    'updated_at',
    'setor_nome',
    'localidade_nome',
    'colaborador_nome',
    'maquina_label',
    'notebook_label',
    'aparelho_label',
    'impressora_label',
    'ramal_label',
    'rack_label',
    'monitor_label',
    'recurso_label',
    'setor_rel',
    'localidade_rel',
    'colaborador',
    'maquina',
    'notebook',
    'aparelho',
    'impressora',
    'ramal',
    'rack',
    'alocacoes',
    'alocacao_ativa',
    'alocacoes_ativas',
    '_count',
    'pasta_nome',
    'enviado_por_nome',
  ]) {
    delete clean[key]
  }
  return clean
}

function isUuid(value: unknown) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function coerceDate(value: unknown, fallback: Date) {
  if (typeof value === 'string' || typeof value === 'number') return new Date(value)
  if (Object.prototype.toString.call(value) === '[object Date]') return value as Date
  return fallback
}

function normalizeInventarioWritePayload(tipoRecurso: string, payload: Record<string, unknown>) {
  const normalized = { ...payload }
  if (tipoRecurso === 'impressoras') {
    if (typeof normalized.revisao === 'string' && normalized.revisao) {
      normalized.revisao = new Date(`${normalized.revisao}T00:00:00.000Z`)
    } else if (normalized.revisao === '' || normalized.revisao === null) {
      normalized.revisao = null
    }
  }
  return normalized
}

async function findLabel(delegateName: string, id: unknown, labelKeys: string[]) {
  if (!isUuid(id)) return null
  const delegate = (prisma as unknown as Record<string, { findUnique?: (args: unknown) => Promise<Record<string, unknown> | null> }>)[delegateName]
  if (!delegate?.findUnique) return null

  try {
    const record = await delegate.findUnique({ where: { id } })
    if (!record) return null
    for (const key of labelKeys) {
      const value = record[key]
      if (value !== null && value !== undefined && String(value).trim()) return String(value)
    }
    return null
  } catch {
    return null
  }
}

export async function enriquecerPayloadInventario(tipoRecurso: string, payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload

  const enriched = { ...(payload as Record<string, unknown>) }
  const additions = await Promise.all([
    findLabel('setores', enriched.setor_id, ['nome']).then(label => { if (label) enriched.setor_nome = label }),
    findLabel('localidades', enriched.localidade_id, ['nome']).then(label => { if (label) enriched.localidade_nome = label }),
    findLabel('colaboradores', enriched.colaborador_id, ['nome', 'codigo']).then(label => { if (label) enriched.colaborador_nome = label }),
    findLabel('maquinas', enriched.maquina_id, ['endereco_ip', 'nome_host', 'identificador', 'modelo']).then(label => { if (label) enriched.maquina_label = label }),
    findLabel('notebooks', enriched.notebook_id, ['numero_patrimonio', 'modelo', 'fabricante']).then(label => { if (label) enriched.notebook_label = label }),
    findLabel('aparelhos', enriched.aparelho_id, ['modelo', 'endereco_ip', 'endereco_mac']).then(label => { if (label) enriched.aparelho_label = label }),
    findLabel('impressoras', enriched.impressora_id, ['endereco_ip', 'nome_host', 'modelo', 'numero_serie']).then(label => { if (label) enriched.impressora_label = label }),
    findLabel('ramais', enriched.ramal_id, ['numero_ramal', 'prefixo_telefonico']).then(label => { if (label) enriched.ramal_label = label }),
    findLabel('racks', enriched.rack_id, ['nome_switch', 'localizacao', 'numero_patrimonio']).then(label => { if (label) enriched.rack_label = label }),
    findLabel('monitores', enriched.monitor_id, ['patrimonio', 'codigo_interno', 'marca', 'modelo']).then(label => { if (label) enriched.monitor_label = label }),
  ])
  await Promise.all(additions)

  const resourceConfig = SOLICITACAO_INVENTARIO_RECURSOS[tipoRecurso]
  if (resourceConfig?.alocacao) {
    const allocationLabel = allocationTargetLabel(tipoRecurso, enriched)
    if (allocationLabel) enriched.recurso_label = allocationLabel
    else delete enriched.recurso_label
  } else {
    const resourceLabel = await findLabel(resourceConfig?.delegate ?? '', enriched.id, [
      'endereco_ip',
      'nome_host',
      'nome',
      'numero_ramal',
      'nome_switch',
      'numero_patrimonio',
      'modelo',
      'identificador',
    ])
    if (resourceLabel) enriched.recurso_label = resourceLabel
  }

  return enriched
}

export async function buscarSnapshotInventario(tipoRecurso: string, recursoId?: string | null) {
  if (!recursoId) return null
  const delegate = getResourceDelegate(tipoRecurso)
  if (!delegate?.findUnique) return null
  const snapshot = await delegate.findUnique({ where: { id: recursoId } })
  return enriquecerPayloadInventario(tipoRecurso, snapshot)
}

export async function buscarSnapshotSolicitacaoInventario(
  tipoRecurso: string,
  recursoId: string | null,
  snapshotInformado: unknown,
) {
  const snapshotBanco = await buscarSnapshotInventario(tipoRecurso, recursoId)
  if (!snapshotBanco || !snapshotInformado || typeof snapshotInformado !== 'object' || Array.isArray(snapshotInformado)) {
    return snapshotInformado ? enriquecerPayloadInventario(tipoRecurso, snapshotInformado) : snapshotBanco
  }

  return enriquecerPayloadInventario(tipoRecurso, {
    ...(snapshotBanco as Record<string, unknown>),
    ...snapshotInformado,
  })
}

function firstString(...values: unknown[]) {
  const found = values.find(value => typeof value === 'string' && value.trim())
  return found ? String(found) : null
}

function firstDisplayString(...values: unknown[]) {
  const found = values.find(value => typeof value === 'string' && value.trim() && !isUuid(value.trim()))
  return found ? String(found).trim() : null
}

function allocationAssetId(tipoRecurso: string, payload: Record<string, unknown> | null | undefined) {
  const assetKey = ALOCACAO_ASSET_KEYS[tipoRecurso]
  if (!assetKey || !payload) return null
  return firstString(payload[assetKey])
}

function allocationTargetLabel(tipoRecurso: string, payload: Record<string, unknown> | null | undefined) {
  if (!payload) return null
  const labelKeys = [
    'maquina_label',
    'notebook_label',
    'aparelho_label',
    'ramal_label',
    'monitor_label',
    'recurso_label',
  ]
  return firstDisplayString(...labelKeys.map(key => payload[key]))
}

function allocationCollaboratorLabel(payload: Record<string, unknown> | null | undefined) {
  if (!payload) return null
  return firstString(payload.colaborador_nome, payload.colaborador_id)
}

function labelAtivo(prefixo: string, label: unknown) {
  const text = typeof label === 'string' ? label.trim() : ''
  return `${prefixo} ${text || 'sem identificação'}`
}

async function registrarDesalocacoesPorInativacao(
  colaboradorId: string,
  colaboradorNome: string,
  user: { usuario_id: string | null; usuario_nome: string | null },
) {
  const agora = new Date()
  const [maquinas, notebooks, aparelhos, ramais] = await Promise.all([
    prisma.alocacoes_maquinas.findMany({
      where: { colaborador_id: colaboradorId, ativo: true },
      include: { maquina: { select: { endereco_ip: true, nome_host: true } } },
    }),
    prisma.alocacoes_notebooks.findMany({
      where: { colaborador_id: colaboradorId, ativo: true },
      include: { notebook: { select: { numero_patrimonio: true } } },
    }),
    prisma.alocacoes_aparelhos.findMany({
      where: { colaborador_id: colaboradorId, ativo: true },
      include: { aparelho: { select: { modelo: true } } },
    }),
    prisma.alocacoes_ramais.findMany({
      where: { colaborador_id: colaboradorId, ativo: true },
      include: { ramal: { select: { numero_ramal: true } } },
    }),
  ])

  await Promise.all([
    prisma.alocacoes_maquinas.updateMany({ where: { colaborador_id: colaboradorId, ativo: true }, data: { ativo: false, data_fim: agora } }),
    prisma.alocacoes_notebooks.updateMany({ where: { colaborador_id: colaboradorId, ativo: true }, data: { ativo: false, data_fim: agora } }),
    prisma.alocacoes_aparelhos.updateMany({ where: { colaborador_id: colaboradorId, ativo: true }, data: { ativo: false, data_fim: agora } }),
    prisma.alocacoes_ramais.updateMany({ where: { colaborador_id: colaboradorId, ativo: true }, data: { ativo: false, data_fim: agora } }),
  ])

  const labelsDesalocados = [
    ...maquinas.map(a => labelAtivo('Máquina', a.maquina?.endereco_ip ?? a.maquina?.nome_host)),
    ...notebooks.map(a => labelAtivo('Notebook', a.notebook?.numero_patrimonio)),
    ...aparelhos.map(a => labelAtivo('Aparelho', a.aparelho?.modelo)),
    ...ramais.map(a => labelAtivo('Ramal', a.ramal?.numero_ramal)),
  ]
  if (labelsDesalocados.length === 0) return

  await Promise.all([
    ...maquinas.map(a => registrarAuditoria({
      tabela: 'alocacoes_maquinas',
      registro_id: a.maquina_id ?? a.id,
      acao: 'DESALOCAR',
      descricao: `${labelAtivo('Máquina', a.maquina?.endereco_ip ?? a.maquina?.nome_host)} desalocada automaticamente ao inativar ${colaboradorNome}`,
      dados_anteriores: {
        alocacao_id: a.id,
        maquina_id: a.maquina_id,
        maquina_label: a.maquina?.endereco_ip ?? a.maquina?.nome_host ?? null,
        colaborador_id: colaboradorId,
        colaborador_nome: colaboradorNome,
        ativo: true,
      },
      dados_novos: { alocacao_id: a.id, maquina_id: a.maquina_id, colaborador_id: colaboradorId, colaborador_nome: colaboradorNome, data_fim: agora, ativo: false },
      usuario_id: user.usuario_id,
      usuario_nome: user.usuario_nome,
    })),
    ...notebooks.map(a => registrarAuditoria({
      tabela: 'alocacoes_notebooks',
      registro_id: a.notebook_id ?? a.id,
      acao: 'DESALOCAR',
      descricao: `${labelAtivo('Notebook', a.notebook?.numero_patrimonio)} desalocado automaticamente ao inativar ${colaboradorNome}`,
      dados_anteriores: {
        alocacao_id: a.id,
        notebook_id: a.notebook_id,
        notebook_label: a.notebook?.numero_patrimonio ?? null,
        colaborador_id: colaboradorId,
        colaborador_nome: colaboradorNome,
        ativo: true,
      },
      dados_novos: { alocacao_id: a.id, notebook_id: a.notebook_id, colaborador_id: colaboradorId, colaborador_nome: colaboradorNome, data_fim: agora, ativo: false },
      usuario_id: user.usuario_id,
      usuario_nome: user.usuario_nome,
    })),
    ...aparelhos.map(a => registrarAuditoria({
      tabela: 'alocacoes_aparelhos',
      registro_id: a.aparelho_id ?? a.id,
      acao: 'DESALOCAR',
      descricao: `${labelAtivo('Aparelho', a.aparelho?.modelo)} desalocado automaticamente ao inativar ${colaboradorNome}`,
      dados_anteriores: {
        alocacao_id: a.id,
        aparelho_id: a.aparelho_id,
        aparelho_label: a.aparelho?.modelo ?? null,
        colaborador_id: colaboradorId,
        colaborador_nome: colaboradorNome,
        ativo: true,
      },
      dados_novos: { alocacao_id: a.id, aparelho_id: a.aparelho_id, colaborador_id: colaboradorId, colaborador_nome: colaboradorNome, data_fim: agora, ativo: false },
      usuario_id: user.usuario_id,
      usuario_nome: user.usuario_nome,
    })),
    ...ramais.map(a => registrarAuditoria({
      tabela: 'alocacoes_ramais',
      registro_id: a.ramal_id ?? a.id,
      acao: 'DESALOCAR',
      descricao: `${labelAtivo('Ramal', a.ramal?.numero_ramal)} desalocado automaticamente ao inativar ${colaboradorNome}`,
      dados_anteriores: {
        alocacao_id: a.id,
        ramal_id: a.ramal_id,
        ramal_label: a.ramal?.numero_ramal ?? null,
        colaborador_id: colaboradorId,
        colaborador_nome: colaboradorNome,
        ativo: true,
      },
      dados_novos: { alocacao_id: a.id, ramal_id: a.ramal_id, colaborador_id: colaboradorId, colaborador_nome: colaboradorNome, data_fim: agora, ativo: false },
      usuario_id: user.usuario_id,
      usuario_nome: user.usuario_nome,
    })),
  ])

  await registrarAuditoria({
    tabela: 'colaboradores',
    registro_id: colaboradorId,
    acao: 'DESALOCAR',
    descricao: `${labelsDesalocados.length} alocação${labelsDesalocados.length > 1 ? 'ões' : ''} desalocada${labelsDesalocados.length > 1 ? 's' : ''}: ${labelsDesalocados.join(', ')}`,
    dados_anteriores: { ativos: labelsDesalocados },
    dados_novos: null,
    usuario_id: user.usuario_id,
    usuario_nome: user.usuario_nome,
  })
}

export async function assimilarTrocaAlocacaoPendente(params: {
  tipoRecurso: string
  acao: string
  dadosPropostos: Record<string, unknown>
  comentario: Record<string, unknown> | null
  usuarioId: string | null
}) {
  const assetId = allocationAssetId(params.tipoRecurso, params.dadosPropostos)
  if (params.acao !== 'ALLOCATE' || !assetId || !SOLICITACAO_INVENTARIO_RECURSOS[params.tipoRecurso]?.alocacao) return null

  const delegate = (prisma as any).solicitacoes_inventario as any
  const pendentes = await delegate.findMany({
    where: {
      status: 'pendente',
      tipo_recurso: params.tipoRecurso,
      acao: 'DEALLOCATE',
      solicitante_id: params.usuarioId,
    },
    orderBy: { created_at: 'desc' },
    take: 20,
  })

  const troca = pendentes.find((pedido: SolicitacaoInventarioAplicavel) => {
    const anteriores = pedido.dados_anteriores ?? {}
    return allocationAssetId(params.tipoRecurso, anteriores) === assetId
  })
  if (!troca) return null

  const comentariosAtuais = Array.isArray((troca as any).comentarios) ? (troca as any).comentarios : []
  const comentarios = params.comentario ? [...comentariosAtuais, params.comentario] : comentariosAtuais
  return delegate.update({
    where: { id: troca.id },
    data: {
      acao: 'ALLOCATE',
      dados_propostos: params.dadosPropostos as Prisma.InputJsonValue,
      comentarios: comentarios as Prisma.InputJsonValue,
      updated_at: new Date(),
    },
  })
}

export function sanitizeSolicitacaoInventarioResponse<T extends SolicitacaoInventarioResponse>(solicitacao: T): T {
  if (solicitacao.tipo_recurso !== 'forum_arquivos') return solicitacao
  const dadosPropostos = solicitacao.dados_propostos
  if (typeof dadosPropostos?.url_publica !== 'string') return solicitacao
  if (!dadosPropostos.url_publica.startsWith('data:')) return solicitacao

  return {
    ...solicitacao,
    dados_propostos: {
      ...dadosPropostos,
      url_publica: '[arquivo anexado ao pedido]',
    },
  }
}

export function sanitizeSolicitacoesInventarioResponse<T extends SolicitacaoInventarioResponse>(solicitacoes: T[]) {
  return solicitacoes.map(sanitizeSolicitacaoInventarioResponse)
}

export async function aplicarSolicitacaoInventario(
  solicitacao: SolicitacaoInventarioAplicavel,
  reviewer: { usuario_id: string | null; usuario_nome: string | null },
) {
  const tipoRecurso = normalizarTipoRecurso(solicitacao.tipo_recurso)
  if (!tipoRecurso) throw new Error('Tipo de recurso inválido')

  const recurso = SOLICITACAO_INVENTARIO_RECURSOS[tipoRecurso]
  const delegate = getResourceDelegate(tipoRecurso)
  if (!delegate) throw new Error('Recurso não suportado')

  const acao = solicitacao.acao as SolicitacaoInventarioAcao
  const dadosPropostos = normalizeInventarioWritePayload(tipoRecurso, cleanInventarioPayload(solicitacao.dados_propostos))
  const recursoId = solicitacao.recurso_id
  let anterior = recursoId ? await buscarSnapshotInventario(tipoRecurso, recursoId) : null
  let resultado: Record<string, unknown> | null = null
  let auditAction: AuditAction = acao as AuditAction
  const isAllocationResource = Boolean(recurso.alocacao)
  const assetId = allocationAssetId(tipoRecurso, dadosPropostos) ?? allocationAssetId(tipoRecurso, anterior as Record<string, unknown> | null)
  const previousCollaborator = allocationCollaboratorLabel(anterior as Record<string, unknown> | null)
  const nextCollaborator = allocationCollaboratorLabel(dadosPropostos)
  const targetLabel = allocationTargetLabel(tipoRecurso, dadosPropostos) ?? allocationTargetLabel(tipoRecurso, anterior as Record<string, unknown> | null)

  if (tipoRecurso === 'forum_arquivos' && acao === 'UPLOAD') {
    resultado = await delegate.create({ data: dadosPropostos })
    auditAction = 'CREATE'
  } else if (tipoRecurso === 'alocacoes_monitores' && acao === 'ALLOCATE') {
    const monitorId = typeof dadosPropostos.monitor_id === 'string' ? dadosPropostos.monitor_id : null
    if (!monitorId) throw new Error('monitor_id é obrigatório para alocação de monitor')

    const now = new Date()
    const dataInicioRaw = dadosPropostos.data_inicio
    const { anterioresAtivas, novaAlocacao } = await prisma.$transaction(async tx => {
      const atuais = await tx.alocacoes_monitores.findMany({
        where: { monitor_id: monitorId, ativo: true },
      })

      await tx.alocacoes_monitores.updateMany({
        where: { monitor_id: monitorId, ativo: true },
        data: { ativo: false, data_fim: now, atualizado_em: now },
      })

      const criada = await tx.alocacoes_monitores.create({
        data: {
          monitor_id: monitorId,
          maquina_id: typeof dadosPropostos.maquina_id === 'string' ? dadosPropostos.maquina_id : null,
          setor_id: typeof dadosPropostos.setor_id === 'string' ? dadosPropostos.setor_id : null,
          data_inicio: coerceDate(dataInicioRaw, now),
          ativo: true,
          criado_por: reviewer.usuario_id,
        },
      })

      return { anterioresAtivas: atuais, novaAlocacao: criada }
    })

    anterior = (solicitacao.dados_anteriores ?? anterioresAtivas[0] ?? anterior) as Record<string, unknown> | null
    resultado = novaAlocacao
    auditAction = 'ALOCAR'

    for (const alocacaoAnterior of anterioresAtivas) {
      await registrarAuditoria({
        tabela: 'alocacoes_monitores',
        registro_id: alocacaoAnterior.id,
        acao: 'DESALOCAR',
        descricao: 'Monitor desalocado automaticamente para novo vínculo aprovado em pedido',
        dados_anteriores: alocacaoAnterior,
        dados_novos: { ...alocacaoAnterior, ativo: false, data_fim: now, atualizado_em: now },
        usuario_id: reviewer.usuario_id,
        usuario_nome: reviewer.usuario_nome,
      })
    }
  } else if (acao === 'CREATE' || acao === 'ALLOCATE') {
    if (acao === 'ALLOCATE' && isAllocationResource && recursoId) {
      const now = new Date()
      await delegate.update({ where: { id: recursoId }, data: { ativo: false, data_fim: now } })
      resultado = await delegate.create({ data: { ...dadosPropostos, data_inicio: now, ativo: true } })
    } else {
      resultado = await delegate.create({ data: dadosPropostos })
    }
    auditAction = recurso.alocacao || acao === 'ALLOCATE' ? 'ALOCAR' : 'CREATE'
  } else if (acao === 'UPDATE' || acao === 'CORRECTION') {
    if (!recursoId) throw new Error('recurso_id é obrigatório para edição')
    resultado = await delegate.update({ where: { id: recursoId }, data: dadosPropostos })
    if (tipoRecurso === 'colaboradores' && dadosPropostos.status === 'Inativo') {
      const colaboradorNome = firstString((anterior as Record<string, unknown> | null)?.nome, resultado?.nome) ?? recursoId
      await registrarDesalocacoesPorInativacao(recursoId, colaboradorNome, reviewer)
    }
    auditAction = recurso.alocacao ? 'EDITAR_ALOCACAO' : 'UPDATE'
  } else if (acao === 'DELETE') {
    if (!recursoId) throw new Error('recurso_id é obrigatório para exclusão')
    resultado = await delegate.delete({ where: { id: recursoId } })
    auditAction = 'DELETE'
  } else if (acao === 'DEALLOCATE') {
    if (!recursoId) throw new Error('recurso_id é obrigatório para desalocação')
    resultado = await delegate.update({
      where: { id: recursoId },
      data: { ativo: false, data_fim: new Date() },
    })
    auditAction = 'DESALOCAR'
  } else {
    throw new Error('Ação inválida')
  }

  await registrarAuditoria({
    tabela: tipoRecurso,
    registro_id: String(isAllocationResource ? (assetId ?? resultado?.id ?? recursoId ?? solicitacao.id) : (resultado?.id ?? recursoId ?? solicitacao.id)),
    acao: auditAction,
    descricao: tipoRecurso === 'forum_arquivos' && acao === 'UPLOAD'
      ? `Upload aprovado: ${String(dadosPropostos.nome_original ?? 'arquivo')}`
      : isAllocationResource && acao === 'ALLOCATE' && recursoId
        ? `Troca de alocação${targetLabel ? ` em ${targetLabel}` : ''}: ${previousCollaborator ?? 'colaborador anterior'} → ${nextCollaborator ?? 'novo colaborador'}`
      : isAllocationResource && acao === 'ALLOCATE'
        ? `Alocação aprovada${targetLabel ? ` em ${targetLabel}` : ''}: ${nextCollaborator ?? 'colaborador'}`
      : isAllocationResource && acao === 'DEALLOCATE'
        ? `Desalocação aprovada${targetLabel ? ` em ${targetLabel}` : ''}: ${previousCollaborator ?? 'colaborador'}`
      : auditAction === 'UPDATE' || auditAction === 'EDITAR_ALOCACAO'
        ? descricaoDiff((anterior ?? {}) as Record<string, unknown>, dadosPropostos)
        : `Solicitação de inventário aprovada: ${recurso.label}`,
    dados_anteriores: (anterior ?? solicitacao.dados_anteriores ?? null) as Prisma.JsonObject | null,
    dados_novos: (resultado ?? dadosPropostos ?? null) as Prisma.JsonObject | null,
    usuario_id: reviewer.usuario_id,
    usuario_nome: reviewer.usuario_nome,
  })

  return resultado
}

export async function descartarUploadPendenteSolicitacao(solicitacao: SolicitacaoInventarioAplicavel) {
  if (solicitacao.tipo_recurso !== 'forum_arquivos' || solicitacao.acao !== 'UPLOAD') return

  const storagePath = solicitacao.dados_propostos?.nome_armazenado
  const publicUrl = solicitacao.dados_propostos?.url_publica
  if (typeof storagePath !== 'string' || !storagePath.trim()) return
  if (storagePath.startsWith('inline-upload/') || (typeof publicUrl === 'string' && publicUrl.startsWith('data:'))) return

  try {
    await deleteArquivo(storagePath)
  } catch (error) {
    console.error('[solicitacoes-inventario] erro ao remover upload pendente', error)
  }
}
