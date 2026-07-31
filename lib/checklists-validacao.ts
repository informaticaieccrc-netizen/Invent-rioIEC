import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { registrarAuditoria } from '@/lib/audit'

export const CHECKLIST_STATUS = ['aberto', 'finalizado'] as const
export const SOLICITACAO_STATUS = ['aberta', 'assumida', 'finalizada', 'revisada'] as const
export const REVISAO_STATUS = ['pendente', 'aprovado', 'recusado', 'parcial'] as const
export const PLANNER_STATUS = ['pendente', 'assumido', 'concluido'] as const
export const TIPOS_SOLICITACAO = ['SETOR', 'RACK'] as const
export const TIPOS_ITEM = ['MAQUINA', 'RAMAL', 'MONITOR', 'IMPRESSORA'] as const

export type TipoItem = (typeof TIPOS_ITEM)[number]
export type TipoSolicitacao = (typeof TIPOS_SOLICITACAO)[number]

type UserRef = { id?: string | null; nome?: string | null }

export class ChecklistError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

export function delegate(name: string) {
  return (prisma as any)[name] as any
}

function normalizeOrigin(value?: string | null) {
  const raw = text(value)
  if (!raw) return null
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(withProtocol)
    return url.origin
  } catch {
    return null
  }
}

export function publicAppOrigin(fallback?: string | null) {
  return normalizeOrigin(process.env.CHECKLIST_PUBLIC_BASE_URL)
    ?? normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL)
    ?? normalizeOrigin(process.env.APP_URL)
    ?? normalizeOrigin(process.env.NEXTAUTH_URL)
    ?? normalizeOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL)
    ?? normalizeOrigin(process.env.VERCEL_URL)
    ?? normalizeOrigin(fallback)
}

export function checklistUrl(solicitacaoId: string, origin?: string | null) {
  const path = `/checklists-validacao/solicitacoes/${solicitacaoId}`
  const resolvedOrigin = publicAppOrigin(origin)
  return resolvedOrigin ? `${resolvedOrigin}${path}` : path
}

function text(value: unknown) {
  if (value == null) return null
  const str = String(value).trim()
  return str || null
}

function sameValue(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return (value ?? null) as Prisma.InputJsonValue
}

export async function deriveSetoresDaLocalidade(localidadeId: string) {
  const [maquinas, ramais, impressoras] = await Promise.all([
    prisma.maquinas.findMany({ where: { localidade_id: localidadeId, setor_id: { not: null } }, select: { setor_id: true } }),
    prisma.ramais.findMany({ where: { localidade_id: localidadeId, setor_id: { not: null } }, select: { setor_id: true } }),
    prisma.impressoras.findMany({ where: { localidade_id: localidadeId, setor_id: { not: null } }, select: { setor_id: true } }),
  ])
  return Array.from(new Set([...maquinas, ...ramais, ...impressoras].map(item => item.setor_id).filter(Boolean))) as string[]
}

export async function createChecklist(params: {
  nome: string
  localidade_id: string
  incluir_racks: boolean
  data_inicio?: string | null
  origin?: string | null
  user: UserRef
}) {
  const nome = text(params.nome)
  if (!nome) throw new ChecklistError('Nome é obrigatório')

  const localidade = await prisma.localidades.findFirst({ where: { id: params.localidade_id, ativo: true } })
  if (!localidade) throw new ChecklistError('Localidade inválida ou inativa', 404)

  const setorIds = await deriveSetoresDaLocalidade(params.localidade_id)
  const racks = params.incluir_racks
    ? await prisma.racks.findMany({ where: { localidade_id: params.localidade_id }, select: { id: true } })
    : []

  const checklist = await prisma.$transaction(async tx => {
    const created = await (tx as any).checklists_validacao.create({
      data: {
        nome,
        localidade_id: params.localidade_id,
        incluir_racks: params.incluir_racks,
        data_inicio: params.data_inicio ? new Date(params.data_inicio) : null,
        data_fim: null,
        criado_por: params.user.id ?? null,
      },
    })

    const rows = [
      ...setorIds.map(setor_id => ({ checklist_validacao_id: created.id, tipo_solicitacao: 'SETOR', setor_id })),
      ...racks.map(rack => ({ checklist_validacao_id: created.id, tipo_solicitacao: 'RACK', rack_id: rack.id })),
    ]

    for (const row of rows) {
      const solicitacao = await (tx as any).checklists_validacao_solicitacoes.create({ data: row })
      await (tx as any).checklists_validacao_solicitacoes.update({
        where: { id: solicitacao.id },
        data: { link_inventario: checklistUrl(solicitacao.id, params.origin) },
      })
    }

    return created
  })

  await registrarAuditoria({
    tabela: 'checklists_validacao',
    registro_id: checklist.id,
    acao: 'CREATE',
    descricao: `Checklist "${nome}" criado`,
    dados_novos: checklist,
    usuario_id: params.user.id ?? null,
    usuario_nome: params.user.nome ?? null,
  })

  return checklist
}

export async function ensureSolicitacaoEditable(id: string, user: UserRef, isAdmin = false) {
  const solicitacao = await delegate('checklists_validacao_solicitacoes').findUnique({ where: { id } })
  if (!solicitacao) throw new ChecklistError('Solicitação não encontrada', 404)
  if (solicitacao.status === 'finalizada' && !isAdmin) throw new ChecklistError('Solicitação finalizada não pode ser editada', 409)
  if (solicitacao.assumido_por && solicitacao.assumido_por !== user.id && !isAdmin) {
    throw new ChecklistError('Solicitação assumida por outro técnico', 409)
  }
  return solicitacao
}

export async function ensureSolicitacaoFillable(id: string, user: UserRef, isAdmin = false) {
  const solicitacao = await ensureSolicitacaoEditable(id, user, isAdmin)
  if (!isAdmin) {
    if (!user.id) throw new ChecklistError('Usuário não identificado para preenchimento', 401)
    if (!solicitacao.assumido_por) throw new ChecklistError('Solicitação precisa ser assumida antes do preenchimento', 409)
    if (solicitacao.assumido_por !== user.id) throw new ChecklistError('Solicitação assumida por outro técnico', 409)
  }
  return solicitacao
}

export async function ensureSolicitacaoRevisable(id: string) {
  const solicitacao = await delegate('checklists_validacao_solicitacoes').findUnique({ where: { id } })
  if (!solicitacao) throw new ChecklistError('Solicitação não encontrada', 404)
  if (solicitacao.status !== 'finalizada' && solicitacao.status !== 'revisada') {
    throw new ChecklistError('Solicitação só pode ser revisada depois de finalizada por um técnico', 409)
  }
  return solicitacao
}

export async function getSolicitacaoAssimilationAudit(solicitacaoId: string) {
  return delegate('audit_log').findFirst({
    where: {
      tabela: 'checklists_validacao_solicitacoes',
      registro_id: solicitacaoId,
      acao: 'APROVAR',
      OR: [
        { descricao: { contains: 'assimilado', mode: 'insensitive' } },
        { descricao: { contains: 'assimilados', mode: 'insensitive' } },
      ],
    },
    orderBy: { created_at: 'desc' },
  })
}

export async function ensureSolicitacaoNotAssimilated(id: string) {
  const audit = await getSolicitacaoAssimilationAudit(id)
  if (audit) throw new ChecklistError('Solicitação já assimilada. A alteração fica preservada somente na auditoria.', 409)
  return audit
}

export async function gerarCodigoInternoMonitor() {
  for (let i = 0; i < 50; i += 1) {
    const code = `MON-${Math.floor(1000 + Math.random() * 9000)}`
    const exists = await delegate('monitores').findUnique({ where: { codigo_interno: code } })
    if (!exists) return code
  }
  throw new ChecklistError('Não foi possível gerar código interno único', 500)
}

async function findReferencia(tipo: TipoItem, dados: Record<string, any>) {
  if (tipo === 'MAQUINA') {
    return prisma.maquinas.findFirst({
      where: {
        OR: [
          text(dados.referencia_id) ? { id: text(dados.referencia_id)! } : undefined,
          text(dados.patrimonio) ? { patrimonio_cpu: text(dados.patrimonio)! } : undefined,
          text(dados.hostname) ? { nome_host: { equals: text(dados.hostname)!, mode: 'insensitive' } } : undefined,
          text(dados.nome_host) ? { nome_host: { equals: text(dados.nome_host)!, mode: 'insensitive' } } : undefined,
          text(dados.maquina_hostname) ? { nome_host: { equals: text(dados.maquina_hostname)!, mode: 'insensitive' } } : undefined,
          text(dados.ip) ? { endereco_ip: text(dados.ip)! } : undefined,
          text(dados.endereco_ip) ? { endereco_ip: text(dados.endereco_ip)! } : undefined,
          text(dados.identificador) ? { identificador: text(dados.identificador)! } : undefined,
        ].filter(Boolean) as any,
      },
    })
  }
  if (tipo === 'RAMAL') {
    return prisma.ramais.findFirst({ where: { numero_ramal: text(dados.numero_ramal) ?? text(dados.numero) ?? undefined } })
  }
  if (tipo === 'IMPRESSORA') {
    return prisma.impressoras.findFirst({
      where: {
        OR: [
          text(dados.referencia_id) ? { id: text(dados.referencia_id)! } : undefined,
          text(dados.nome_rede) ? { nome_host: { equals: text(dados.nome_rede)!, mode: 'insensitive' } } : undefined,
          text(dados.nome_host) ? { nome_host: { equals: text(dados.nome_host)!, mode: 'insensitive' } } : undefined,
          text(dados.ip) ? { endereco_ip: text(dados.ip)! } : undefined,
          text(dados.endereco_ip) ? { endereco_ip: text(dados.endereco_ip)! } : undefined,
          text(dados.patrimonio) ? { identificador_selb: text(dados.patrimonio)! } : undefined,
          text(dados.numero_serie) ? { numero_serie: text(dados.numero_serie)! } : undefined,
          text(dados.serial) ? { numero_serie: text(dados.serial)! } : undefined,
        ].filter(Boolean) as any,
      },
    })
  }
  return delegate('monitores').findFirst({
    where: {
      OR: [
        text(dados.referencia_id) ? { id: text(dados.referencia_id)! } : undefined,
        text(dados.codigo_interno) ? { codigo_interno: text(dados.codigo_interno)! } : undefined,
        text(dados.patrimonio) ? { patrimonio: text(dados.patrimonio)! } : undefined,
        text(dados.serial) ? { serial: text(dados.serial)! } : undefined,
      ].filter(Boolean),
    },
    include: { alocacoes: { where: { ativo: true }, take: 1 } },
  })
}

function fieldsFor(tipo: TipoItem) {
  if (tipo === 'MAQUINA') return [
    ['nome_host', 'hostname'],
    ['patrimonio_cpu', 'patrimonio'],
    ['setor_id', 'setor_id'],
    ['localidade_id', 'localidade_id'],
  ] as const
  if (tipo === 'RAMAL') return [
    ['numero_ramal', 'numero_ramal'],
    ['setor_id', 'setor_id'],
    ['localidade_id', 'localidade_id'],
  ] as const
  if (tipo === 'IMPRESSORA') return [
    ['nome_host', 'nome_rede'],
    ['endereco_ip', 'ip'],
    ['modelo', 'modelo'],
    ['setor_id', 'setor_id'],
    ['localidade_id', 'localidade_id'],
  ] as const
  return [
    ['patrimonio', 'patrimonio'],
    ['codigo_interno', 'codigo_interno'],
    ['marca', 'marca'],
    ['modelo', 'modelo'],
    ['serial', 'serial'],
  ] as const
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function stationRefFromData(data: Record<string, any>) {
  return text(data.estacao_ref) ?? text(data.hostname) ?? text(data.maquina_hostname) ?? text(data.patrimonio)
}

function splitIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => text(item)).filter(isUuid)
  return String(value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(isUuid)
}

function itemData(item: any) {
  return (item?.dados_informados_json ?? {}) as Record<string, any>
}

function reviewMetadata(tipo: TipoItem, solicitacao: any, user: UserRef, now: Date) {
  const common = {
    checklist_ultima_id: solicitacao.checklist_validacao_id,
    checklist_tecnico_id: solicitacao.assumido_por,
    checklist_revisor_id: user.id ?? null,
    checklist_revisado_em: now,
  }

  if (tipo === 'MAQUINA') return { ...common, data_revisao: now }
  if (tipo === 'IMPRESSORA') return { ...common, revisao: now }
  if (tipo === 'MONITOR') return { ...common, atualizado_em: now }
  return common
}

function assetTable(tipo: TipoItem) {
  if (tipo === 'MAQUINA') return 'maquinas'
  if (tipo === 'RAMAL') return 'ramais'
  if (tipo === 'IMPRESSORA') return 'impressoras'
  return 'monitores'
}

function createPayloadForItem(tipo: TipoItem, data: Record<string, any>, solicitacao: any, user: UserRef, now: Date) {
  const setor_id = data.setor_id ?? solicitacao.setor_id ?? null
  const localidade_id = data.localidade_id ?? solicitacao.checklist?.localidade_id ?? null
  const metadata = reviewMetadata(tipo, solicitacao, user, now)

  if (tipo === 'MAQUINA') {
    return {
      nome_host: text(data.hostname),
      patrimonio_cpu: text(data.patrimonio),
      endereco_ip: text(data.ip) ?? text(data.endereco_ip),
      modelo: text(data.modelo),
      memoria_ram: text(data.memoria),
      armazenamento: text(data.armazenamento),
      processador: text(data.processador),
      setor_id,
      localidade_id,
      ...metadata,
    }
  }

  if (tipo === 'RAMAL') {
    return {
      numero_ramal: text(data.numero_ramal) ?? text(data.numero),
      setor_id,
      localidade_id,
      ...metadata,
    }
  }

  if (tipo === 'IMPRESSORA') {
    return {
      nome_host: text(data.nome_rede) ?? text(data.nome_host),
      endereco_ip: text(data.ip) ?? text(data.endereco_ip),
      modelo: text(data.modelo),
      identificador_selb: text(data.patrimonio),
      setor_id,
      localidade_id,
      ...metadata,
    }
  }

  return {
    patrimonio: text(data.patrimonio),
    marca: text(data.marca),
    modelo: text(data.tamanho) ?? text(data.modelo),
    status: text(data.status) ?? 'ativo',
    criado_via_checklist: true,
    criado_por: data.preenchido_por ?? user.id ?? null,
    ...metadata,
  }
}

function updatePayloadForDiff(tipo: TipoItem, diff: any, solicitacao: any, user: UserRef, now: Date) {
  const metadata = reviewMetadata(tipo, solicitacao, user, now)
  if (diff.campo === '_item' || diff.tipo_diff === 'sem_divergencia') return metadata
  return { [diff.campo]: diff.valor_informado, ...metadata }
}

type AuditEntry = {
  tabela: string
  registro_id: string
  acao: 'CREATE' | 'UPDATE' | 'ALOCAR' | 'DESALOCAR' | 'APROVAR'
  descricao?: string
  dados_anteriores?: Record<string, unknown> | null
  dados_novos?: Record<string, unknown> | null
}

type ChecklistCollaboratorAllocation = Record<string, unknown> & {
  id: string
  colaborador_id: string | null
  ativo: boolean
  colaborador?: { id: string; nome: string | null } | null
}

type ChecklistMonitorAllocation = Record<string, unknown> & {
  id: string
  maquina_id: string | null
  ativo: boolean
  maquina?: { id: string; nome_host: string | null } | null
}

type ChecklistItemRow = Record<string, unknown> & {
  id: string
  checklist_validacao_solicitacao_id: string
  tipo_item: TipoItem
  referencia_id: string | null
  identificador_informado: string | null
  dados_informados_json: Record<string, unknown> | null
  status_revisao?: string | null
  diffs?: Array<{ status_revisao: string }>
}

function pushAudit(audits: AuditEntry[], entry: AuditEntry) {
  audits.push(entry)
}

async function reconcileMachineCollaborators(tx: any, params: {
  audits: AuditEntry[]
  item: any
  maquinaId: string
  now: Date
  user: UserRef
}) {
  const data = itemData(params.item)
  const targetIds = splitIds(data.colaboradores_estacao_ids)
  const explicitEmpty = String(data.colaboradores_estacao ?? '').toLowerCase().includes('sem colaborador')
  if (targetIds.length === 0 && !explicitEmpty) return

  const current: ChecklistCollaboratorAllocation[] = await tx.alocacoes_maquinas.findMany({
    where: { maquina_id: params.maquinaId, ativo: true },
    include: { colaborador: { select: { id: true, nome: true } } },
  })
  const targetSet = new Set(targetIds)

  for (const allocation of current) {
    const keep = allocation.colaborador_id && targetSet.has(allocation.colaborador_id)
    if (keep) continue
    const updated = await tx.alocacoes_maquinas.update({
      where: { id: allocation.id },
      data: { ativo: false, data_fim: params.now },
    })
    pushAudit(params.audits, {
      tabela: 'alocacoes_maquinas',
      registro_id: updated.id,
      acao: 'DESALOCAR',
      descricao: `Checklist removeu colaborador da máquina${allocation.colaborador?.nome ? `: ${allocation.colaborador.nome}` : ''}`,
      dados_anteriores: allocation,
      dados_novos: updated,
    })
  }

  for (const colaboradorId of targetIds) {
    if (current.some(allocation => allocation.colaborador_id === colaboradorId && allocation.ativo)) continue
    const created = await tx.alocacoes_maquinas.create({
      data: {
        maquina_id: params.maquinaId,
        colaborador_id: colaboradorId,
        data_inicio: params.now,
        ativo: true,
      },
    })
    pushAudit(params.audits, {
      tabela: 'alocacoes_maquinas',
      registro_id: created.id,
      acao: 'ALOCAR',
      descricao: 'Checklist alocou colaborador na máquina',
      dados_novos: created,
    })
  }
}

async function reconcileRamalCollaborators(tx: any, params: {
  audits: AuditEntry[]
  collaboratorIds: string[]
  now: Date
  ramalId: string
  shouldApply?: boolean
}) {
  const targetSet = new Set(params.collaboratorIds)
  if (targetSet.size === 0 && !params.shouldApply) return

  const current: ChecklistCollaboratorAllocation[] = await tx.alocacoes_ramais.findMany({
    where: { ramal_id: params.ramalId, ativo: true },
    include: { colaborador: { select: { id: true, nome: true } } },
  })

  for (const allocation of current) {
    const keep = allocation.colaborador_id && targetSet.has(allocation.colaborador_id)
    if (keep) continue
    const updated = await tx.alocacoes_ramais.update({
      where: { id: allocation.id },
      data: { ativo: false, data_fim: params.now },
    })
    pushAudit(params.audits, {
      tabela: 'alocacoes_ramais',
      registro_id: updated.id,
      acao: 'DESALOCAR',
      descricao: `Checklist removeu colaborador do ramal${allocation.colaborador?.nome ? `: ${allocation.colaborador.nome}` : ''}`,
      dados_anteriores: allocation,
      dados_novos: updated,
    })
  }

  for (const colaboradorId of params.collaboratorIds) {
    if (current.some(allocation => allocation.colaborador_id === colaboradorId && allocation.ativo)) continue
    const created = await tx.alocacoes_ramais.create({
      data: {
        ramal_id: params.ramalId,
        colaborador_id: colaboradorId,
        data_inicio: params.now,
        ativo: true,
      },
    })
    pushAudit(params.audits, {
      tabela: 'alocacoes_ramais',
      registro_id: created.id,
      acao: 'ALOCAR',
      descricao: 'Checklist alocou colaborador no ramal',
      dados_novos: created,
    })
  }
}

async function reconcileMonitorMachine(tx: any, params: {
  audits: AuditEntry[]
  item: any
  monitorId: string
  maquinaId?: string | null
  now: Date
  solicitacao: any
  user: UserRef
}) {
  const data = itemData(params.item)
  const maquinaId = params.maquinaId ?? text(data.maquina_id)
  if (!maquinaId) return

  const current: ChecklistMonitorAllocation[] = await tx.alocacoes_monitores.findMany({
    where: { monitor_id: params.monitorId, ativo: true },
    include: { maquina: { select: { id: true, nome_host: true } } },
  })

  for (const allocation of current) {
    if (allocation.maquina_id === maquinaId) continue
    const updated = await tx.alocacoes_monitores.update({
      where: { id: allocation.id },
      data: { ativo: false, data_fim: params.now, atualizado_em: params.now },
    })
    pushAudit(params.audits, {
      tabela: 'alocacoes_monitores',
      registro_id: updated.id,
      acao: 'DESALOCAR',
      descricao: `Checklist removeu monitor da máquina${allocation.maquina?.nome_host ? `: ${allocation.maquina.nome_host}` : ''}`,
      dados_anteriores: allocation,
      dados_novos: updated,
    })
  }

  if (current.some(allocation => allocation.maquina_id === maquinaId && allocation.ativo)) return

  const created = await tx.alocacoes_monitores.create({
    data: {
      monitor_id: params.monitorId,
      maquina_id: maquinaId,
      setor_id: data.setor_id ?? params.solicitacao.setor_id ?? null,
      data_inicio: params.now,
      ativo: true,
      criado_por: params.user.id ?? null,
    },
  })
  pushAudit(params.audits, {
    tabela: 'alocacoes_monitores',
    registro_id: created.id,
    acao: 'ALOCAR',
    descricao: 'Checklist vinculou monitor à máquina',
    dados_novos: created,
  })
}

export async function upsertChecklistItem(params: {
  solicitacaoId: string
  tipo_item: TipoItem
  dados: Record<string, any>
  itemId?: string
  user: UserRef
  isAdmin?: boolean
}) {
  if (!TIPOS_ITEM.includes(params.tipo_item)) throw new ChecklistError('Tipo de item inválido')
  const solicitacao = await ensureSolicitacaoFillable(params.solicitacaoId, params.user, params.isAdmin)
  if (solicitacao.tipo_solicitacao !== 'SETOR') throw new ChecklistError('Itens são permitidos apenas em solicitação setorial')

  const dados: Record<string, any> = {
    ...params.dados,
    setor_id: params.dados.setor_id ?? solicitacao.setor_id,
  }
  const referencia = await findReferencia(params.tipo_item, dados)
  const identificador = text(dados.identificador_informado)
    ?? text(dados.hostname)
    ?? text(dados.numero_ramal)
    ?? text(dados.patrimonio)
    ?? text(dados.codigo_interno)
    ?? text(dados.nome_rede)
    ?? text(dados.ip)

  const data = {
    checklist_validacao_solicitacao_id: params.solicitacaoId,
    tipo_item: params.tipo_item,
    referencia_id: referencia?.id ?? null,
    identificador_informado: identificador,
    dados_informados_json: jsonValue(dados),
    preenchido_por: params.user.id ?? null,
    preenchido_em: new Date(),
  }

  if (!params.itemId && params.tipo_item === 'MAQUINA') {
    const stationRef = stationRefFromData(dados)
    const host = text(dados.hostname) ?? text(dados.nome_host)
    const patrimonio = text(dados.patrimonio)
    const normalize = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase()
    const existingItems: ChecklistItemRow[] = await delegate('checklists_validacao_itens').findMany({
      where: {
        checklist_validacao_solicitacao_id: params.solicitacaoId,
        tipo_item: params.tipo_item,
      },
      orderBy: { criado_em: 'asc' },
    })
    const duplicated = existingItems.find(item => {
      const currentData = itemData(item)
      const currentStation = stationRefFromData(currentData)
      const currentHost = text(currentData.hostname) ?? text(currentData.nome_host)
      const currentPatrimonio = text(currentData.patrimonio)
      return Boolean(
        (stationRef && normalize(currentStation) === normalize(stationRef))
        || (host && normalize(currentHost) === normalize(host))
        || (patrimonio && normalize(currentPatrimonio) === normalize(patrimonio))
        || (identificador && normalize(item.identificador_informado) === normalize(identificador)),
      )
    })

    if (duplicated) {
      const atualizado = await delegate('checklists_validacao_itens').update({ where: { id: duplicated.id }, data })
      await registrarAuditoria({
        tabela: 'checklists_validacao_itens',
        registro_id: duplicated.id,
        acao: 'UPDATE',
        descricao: 'Item MAQUINA do checklist consolidado para evitar duplicidade',
        dados_anteriores: duplicated,
        dados_novos: atualizado,
        usuario_id: params.user.id ?? null,
        usuario_nome: params.user.nome ?? null,
      })
      return atualizado
    }
  }

  if (params.itemId) {
    const anterior = await delegate('checklists_validacao_itens').findUnique({ where: { id: params.itemId } })
    const atualizado = await delegate('checklists_validacao_itens').update({ where: { id: params.itemId }, data })
    await registrarAuditoria({
      tabela: 'checklists_validacao_itens',
      registro_id: params.itemId,
      acao: 'UPDATE',
      descricao: `Item ${params.tipo_item} do checklist editado`,
      dados_anteriores: anterior,
      dados_novos: atualizado,
      usuario_id: params.user.id ?? null,
      usuario_nome: params.user.nome ?? null,
    })
    return atualizado
  }
  const criado = await delegate('checklists_validacao_itens').create({ data })
  await registrarAuditoria({
    tabela: 'checklists_validacao_itens',
    registro_id: criado.id,
    acao: 'CREATE',
    descricao: `Item ${params.tipo_item} do checklist preenchido`,
    dados_novos: criado,
    usuario_id: params.user.id ?? null,
    usuario_nome: params.user.nome ?? null,
  })
  return criado
}

function buildDiffsForItem(item: any, referencia: any) {
  const tipo = item.tipo_item as TipoItem
  const dados = (item.dados_informados_json ?? {}) as Record<string, any>
  const diffs: Array<{ campo: string; valor_atual: unknown; valor_informado: unknown; tipo_diff: string }> = []
  if (!referencia) {
    diffs.push({ campo: '_item', valor_atual: null, valor_informado: dados, tipo_diff: 'novo' })
    return diffs
  }

  for (const [currentKey, informedKey] of fieldsFor(tipo)) {
    const informed = dados[informedKey] ?? null
    if (informed == null || informed === '') continue
    const current = referencia[currentKey] ?? null
    if (!sameValue(current, informed)) {
      diffs.push({
        campo: String(currentKey),
        valor_atual: current,
        valor_informado: informed,
        tipo_diff: currentKey === 'setor_id' ? 'vinculo_divergente' : 'alterado',
      })
    }
  }
  if (diffs.length === 0) {
    diffs.push({ campo: '_item', valor_atual: referencia.id, valor_informado: item.identificador_informado, tipo_diff: 'sem_divergencia' })
  }
  return diffs
}

export async function gerarDiffSolicitacao(solicitacaoId: string) {
  const solicitacao = await delegate('checklists_validacao_solicitacoes').findUnique({ where: { id: solicitacaoId } })
  if (!solicitacao) throw new ChecklistError('Solicitação não encontrada', 404)
  if (solicitacao.tipo_solicitacao !== 'SETOR') throw new ChecklistError('Diff só é gerado para solicitação setorial')

  const itens: ChecklistItemRow[] = await delegate('checklists_validacao_itens').findMany({ where: { checklist_validacao_solicitacao_id: solicitacaoId } })
  await delegate('checklists_validacao_diffs').deleteMany({ where: { checklist_validacao_solicitacao_id: solicitacaoId } })

  const created: any[] = []
  for (const item of itens) {
    const referencia = await findReferencia(item.tipo_item, item.dados_informados_json ?? {})
    if (referencia?.id && referencia.id !== item.referencia_id) {
      await delegate('checklists_validacao_itens').update({ where: { id: item.id }, data: { referencia_id: referencia.id } })
    }
    for (const diff of buildDiffsForItem(item, referencia)) {
      const row = await delegate('checklists_validacao_diffs').create({
        data: {
          checklist_validacao_item_id: item.id,
          checklist_validacao_solicitacao_id: solicitacaoId,
          campo: diff.campo,
          valor_atual: jsonValue(diff.valor_atual),
          valor_informado: jsonValue(diff.valor_informado),
          tipo_diff: diff.tipo_diff,
          status_revisao: diff.tipo_diff === 'sem_divergencia' ? 'aprovado' : 'pendente',
        },
      })
      created.push(row)
    }
  }
  await refreshItemReviewStatuses(solicitacaoId)
  return created
}

export async function refreshItemReviewStatuses(solicitacaoId: string) {
  const itens: ChecklistItemRow[] = await delegate('checklists_validacao_itens').findMany({
    where: { checklist_validacao_solicitacao_id: solicitacaoId },
    include: { diffs: true },
  })
  for (const item of itens) {
    const statuses = (item.diffs ?? []).map(diff => diff.status_revisao)
    const reviewed = statuses.filter((status: string) => status === 'aprovado' || status === 'recusado')
    const status = statuses.length === 0
      ? item.status_revisao ?? 'pendente'
      : reviewed.length < statuses.length
        ? 'pendente'
        : statuses.every((s: string) => s === 'aprovado')
          ? 'aprovado'
          : statuses.every((s: string) => s === 'recusado')
            ? 'recusado'
            : 'parcial'
    await delegate('checklists_validacao_itens').update({ where: { id: item.id }, data: { status_revisao: status } })
  }
}

export async function aprovarTudoSolicitacao(solicitacaoId: string, user: UserRef) {
  const solicitacao = await ensureSolicitacaoRevisable(solicitacaoId)
  await ensureSolicitacaoNotAssimilated(solicitacaoId)
  const now = new Date()

  if (solicitacao.tipo_solicitacao === 'RACK') {
    const anterior = await delegate('checklists_validacao_solicitacoes').findUnique({ where: { id: solicitacaoId } })
    const atualizado = await delegate('checklists_validacao_solicitacoes').update({
      where: { id: solicitacaoId },
      data: {
        status: 'revisada',
        status_revisao: 'aprovado',
        revisado_por: user.id ?? null,
        revisado_em: now,
        atualizado_em: now,
      },
    })
    await registrarAuditoria({
      tabela: 'checklists_validacao_solicitacoes',
      registro_id: solicitacaoId,
      acao: 'APROVAR',
      descricao: 'Solicitação de rack aprovada integralmente na revisão do checklist',
      dados_anteriores: anterior,
      dados_novos: atualizado,
      usuario_id: user.id ?? null,
      usuario_nome: user.nome ?? null,
    })
    return { tipo_solicitacao: 'RACK', solicitacao: atualizado, itens_aprovados: 1, diffs_aprovados: 0 }
  }

  if (solicitacao.tipo_solicitacao !== 'SETOR') throw new ChecklistError('Tipo de solicitação inválido')

  const itens: ChecklistItemRow[] = await delegate('checklists_validacao_itens').findMany({
    where: { checklist_validacao_solicitacao_id: solicitacaoId },
    include: { diffs: true },
  })
  if (itens.length === 0) throw new ChecklistError('Nenhum ativo enviado para aprovar', 409)

  let diffs = itens.flatMap(item => item.diffs ?? [])
  if (diffs.length === 0) {
    await gerarDiffSolicitacao(solicitacaoId)
    const itensAtualizados: ChecklistItemRow[] = await delegate('checklists_validacao_itens').findMany({
      where: { checklist_validacao_solicitacao_id: solicitacaoId },
      include: { diffs: true },
    })
    diffs = itensAtualizados.flatMap(item => item.diffs ?? [])
  }

  const anterior = {
    solicitacao,
    itens: itens.map(item => ({ id: item.id, status_revisao: item.status_revisao })),
    diffs: diffs.map(diff => ({ id: diff.id, status_revisao: diff.status_revisao })),
  }

  await prisma.$transaction(async tx => {
    await (tx as any).checklists_validacao_diffs.updateMany({
      where: { checklist_validacao_solicitacao_id: solicitacaoId },
      data: { status_revisao: 'aprovado', atualizado_em: now },
    })
    await (tx as any).checklists_validacao_itens.updateMany({
      where: { checklist_validacao_solicitacao_id: solicitacaoId },
      data: {
        status_revisao: 'aprovado',
        revisado_por: user.id ?? null,
        revisado_em: now,
        atualizado_em: now,
      },
    })
    await (tx as any).checklists_validacao_solicitacoes.update({
      where: { id: solicitacaoId },
      data: {
        status: 'revisada',
        status_revisao: 'aprovado',
        revisado_por: user.id ?? null,
        revisado_em: now,
        atualizado_em: now,
      },
    })
  })

  await registrarAuditoria({
    tabela: 'checklists_validacao_solicitacoes',
    registro_id: solicitacaoId,
    acao: 'APROVAR',
    descricao: 'Todos os ativos e campos da solicitação foram aprovados na revisão do checklist',
    dados_anteriores: anterior,
    dados_novos: {
      itens_aprovados: itens.length,
      diffs_aprovados: diffs.length,
      revisado_por: user.id ?? null,
      revisado_em: now,
    },
    usuario_id: user.id ?? null,
    usuario_nome: user.nome ?? null,
  })

  return {
    tipo_solicitacao: 'SETOR',
    itens_aprovados: itens.length,
    diffs_aprovados: diffs.length,
  }
}

export async function assimilarSolicitacaoSetorial(solicitacaoId: string, user: UserRef) {
  await ensureSolicitacaoRevisable(solicitacaoId)
  await ensureSolicitacaoNotAssimilated(solicitacaoId)
  const solicitacao = await delegate('checklists_validacao_solicitacoes').findUnique({
    where: { id: solicitacaoId },
    include: {
      checklist: true,
      itens: true,
      diffs: { where: { status_revisao: 'aprovado' }, include: { item: true } },
    },
  })
  if (!solicitacao) throw new ChecklistError('Solicitação não encontrada', 404)
  if (solicitacao.tipo_solicitacao !== 'SETOR') throw new ChecklistError('Assimilação setorial inválida')

  const audits: AuditEntry[] = []
  const applied = new Set<string>()
  const approvedByItem = new Map<string, any[]>()
  for (const diff of solicitacao.diffs) {
    const current = approvedByItem.get(diff.item.id) ?? []
    current.push(diff)
    approvedByItem.set(diff.item.id, current)
  }
  const stationCollaborators = new Map<string, string[]>()
  const initialStationMachineIds = new Map<string, string>()
  for (const item of solicitacao.itens ?? []) {
    if (item.tipo_item !== 'MAQUINA') continue
    const data = itemData(item)
    const station = stationRefFromData(data)
    if (!station) continue
    const referencedMachine = item.referencia_id
      ? { id: item.referencia_id }
      : await findReferencia('MAQUINA', data)
    if (referencedMachine?.id) initialStationMachineIds.set(station, referencedMachine.id)
    const ids = splitIds(data.colaboradores_estacao_ids)
    if (ids.length > 0 || String(data.colaboradores_estacao ?? '').toLowerCase().includes('sem colaborador')) {
      stationCollaborators.set(station, ids)
    }
  }

  await prisma.$transaction(async tx => {
    const now = new Date()
    const stationMachineIds = new Map(initialStationMachineIds)
    const orderedItems = Array.from(approvedByItem.entries())
      .sort(([, a], [, b]) => {
        const order = { MAQUINA: 0, RAMAL: 1, MONITOR: 2, IMPRESSORA: 3 } as Record<string, number>
        return (order[a[0]?.item?.tipo_item] ?? 99) - (order[b[0]?.item?.tipo_item] ?? 99)
      })

    for (const [, itemDiffs] of orderedItems) {
      const item = itemDiffs[0].item
      const tipo = item.tipo_item as TipoItem
      const table = assetTable(tipo)
      const data = itemData(item)
      let assetId = item.referencia_id as string | null
      let createdAsset: any = null

      if (!assetId && itemDiffs.some(diff => diff.campo === '_item' && diff.tipo_diff === 'novo')) {
        createdAsset = await (tx as any)[table].create({ data: createPayloadForItem(tipo, data, solicitacao, user, now) })
        const createdAssetId = String(createdAsset.id)
        assetId = createdAssetId
        applied.add(`${table}:${createdAssetId}:create`)
        await (tx as any).checklists_validacao_itens.update({ where: { id: item.id }, data: { referencia_id: createdAssetId, atualizado_em: now } })
        pushAudit(audits, {
          tabela: table,
          registro_id: createdAssetId,
          acao: 'CREATE',
          descricao: `Ativo criado por checklist (${tipo})`,
          dados_novos: createdAsset,
        })
      }

      if (!assetId) continue

      for (const diff of itemDiffs) {
        if (diff.campo === '_item' && diff.tipo_diff === 'novo') continue
        const before = await (tx as any)[table].findUnique({ where: { id: assetId } })
        if (!before) continue
        const updateData = updatePayloadForDiff(tipo, diff, solicitacao, user, now)
        const updated = await (tx as any)[table].update({ where: { id: assetId }, data: updateData })
        applied.add(`${table}:${assetId}:${diff.id}`)
        pushAudit(audits, {
          tabela: table,
          registro_id: assetId,
          acao: diff.tipo_diff === 'sem_divergencia' ? 'APROVAR' : 'UPDATE',
          descricao: diff.tipo_diff === 'sem_divergencia'
            ? `Ativo confirmado por checklist (${tipo})`
            : `Campo "${diff.campo}" assimilado por checklist`,
          dados_anteriores: before,
          dados_novos: updated,
        })
      }

      const station = stationRefFromData(data)
      if (tipo === 'MAQUINA' && station) stationMachineIds.set(station, assetId)

      if (tipo === 'MAQUINA') {
        await reconcileMachineCollaborators(tx, { audits, item, maquinaId: assetId, now, user })
      }

      if (tipo === 'RAMAL') {
        const collaborators = station ? stationCollaborators.get(station) ?? [] : []
        await reconcileRamalCollaborators(tx, {
          audits,
          collaboratorIds: collaborators,
          now,
          ramalId: assetId,
          shouldApply: station ? stationCollaborators.has(station) : false,
        })
      }

      if (tipo === 'MONITOR') {
        const stationMachineId = station ? stationMachineIds.get(station) : null
        const inferredMachine = stationMachineId ? null : await findReferencia('MAQUINA', data)
        await reconcileMonitorMachine(tx, {
          audits,
          item,
          monitorId: assetId,
          maquinaId: stationMachineId ?? inferredMachine?.id ?? null,
          now,
          solicitacao,
          user,
        })
      }
    }

    await (tx as any).checklists_validacao_solicitacoes.update({
      where: { id: solicitacaoId },
      data: { status: 'revisada', revisado_por: user.id ?? null, revisado_em: now },
    })
  })

  for (const audit of audits) {
    await registrarAuditoria({
      ...audit,
      usuario_id: user.id ?? null,
      usuario_nome: user.nome ?? null,
    })
  }

  await registrarAuditoria({
    tabela: 'checklists_validacao_solicitacoes',
    registro_id: solicitacaoId,
    acao: 'APROVAR',
    descricao: 'Diffs aprovados assimilados ao inventário',
    dados_novos: { total_aplicado: applied.size, auditorias_geradas: audits.length },
    usuario_id: user.id ?? null,
    usuario_nome: user.nome ?? null,
  })
  return { applied: applied.size, audits: audits.length }
}

type ReviewSnapshotEntry = {
  label: string
  value: string
}

function displayValue(value: unknown) {
  if (value == null || value === '') return 'Não informado'
  if (value instanceof Date) return value.toLocaleDateString('pt-BR')
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  return String(value)
}

function maybeEntry(label: string, value: unknown): ReviewSnapshotEntry | null {
  const rendered = displayValue(value)
  return rendered === 'Não informado' ? null : { label, value: rendered }
}

function compactEntries(entries: Array<ReviewSnapshotEntry | null>) {
  return entries.filter(Boolean) as ReviewSnapshotEntry[]
}

function collaboratorName(colaborador: any) {
  if (!colaborador) return null
  return colaborador.codigo ? `${colaborador.nome} (${colaborador.codigo})` : colaborador.nome
}

async function setorLabel(id: unknown) {
  if (!isUuid(id)) return displayValue(id)
  const setor = await prisma.setores.findUnique({ where: { id: String(id) }, select: { nome: true } })
  return setor?.nome ?? 'Setor vinculado'
}

async function localidadeLabel(id: unknown) {
  if (!isUuid(id)) return displayValue(id)
  const localidade = await prisma.localidades.findUnique({ where: { id: String(id) }, select: { nome: true } })
  return localidade?.nome ?? 'Localidade vinculada'
}

async function colaboradorLabels(ids: unknown) {
  const targetIds = splitIds(ids)
  if (targetIds.length === 0) return null
  const colaboradores = await prisma.colaboradores.findMany({
    where: { id: { in: targetIds } },
    select: { id: true, nome: true, codigo: true },
    orderBy: { nome: 'asc' },
  })
  const names = targetIds.map(id => collaboratorName(colaboradores.find(colaborador => colaborador.id === id))).filter(Boolean)
  return names.length ? names.join(', ') : 'Colaboradores vinculados'
}

async function maquinaLabel(id: unknown) {
  if (!isUuid(id)) return displayValue(id)
  const maquina = await prisma.maquinas.findUnique({
    where: { id: String(id) },
    select: { nome_host: true, patrimonio_cpu: true, identificador: true },
  })
  return maquina?.nome_host ?? maquina?.patrimonio_cpu ?? maquina?.identificador ?? 'Máquina vinculada'
}

async function referenceTitleForItem(item: any) {
  if (!item?.referencia_id) return null
  const tipo = item.tipo_item as TipoItem
  if (tipo === 'MAQUINA') {
    const row = await prisma.maquinas.findUnique({ where: { id: item.referencia_id }, select: { nome_host: true, patrimonio_cpu: true, identificador: true } })
    return row?.nome_host ?? row?.patrimonio_cpu ?? row?.identificador ?? null
  }
  if (tipo === 'RAMAL') {
    const row = await prisma.ramais.findUnique({ where: { id: item.referencia_id }, select: { numero_ramal: true } })
    return row?.numero_ramal ?? null
  }
  if (tipo === 'IMPRESSORA') {
    const row = await prisma.impressoras.findUnique({ where: { id: item.referencia_id }, select: { nome_host: true, endereco_ip: true, identificador_selb: true } })
    return row?.nome_host ?? row?.endereco_ip ?? row?.identificador_selb ?? null
  }
  const row = await delegate('monitores').findUnique({ where: { id: item.referencia_id }, select: { patrimonio: true, codigo_interno: true, marca: true, modelo: true } })
  return row?.patrimonio ?? row?.codigo_interno ?? [row?.marca, row?.modelo].filter(Boolean).join(' ') ?? null
}

function submittedTitleForItem(item: any) {
  const data = itemData(item)
  return text(item.identificador_informado)
    ?? text(data.hostname)
    ?? text(data.nome_host)
    ?? text(data.nome_rede)
    ?? text(data.patrimonio)
    ?? text(data.numero_ramal)
    ?? text(data.ramal_estacao)
    ?? text(data.ip)
    ?? 'Preenchimento enviado'
}

async function referenceSnapshotForItem(item: any): Promise<ReviewSnapshotEntry[]> {
  if (!item?.referencia_id) return []
  const tipo = item.tipo_item as TipoItem

  if (tipo === 'MAQUINA') {
    const row = await prisma.maquinas.findUnique({
      where: { id: item.referencia_id },
      include: {
        setor_rel: { select: { nome: true } },
        localidade_rel: { select: { nome: true } },
        alocacoes: {
          where: { ativo: true },
          include: { colaborador: { select: { nome: true, codigo: true } } },
        },
      },
    })
    if (!row) return []
    return compactEntries([
      maybeEntry('Host', row.nome_host),
      maybeEntry('Patrimônio', row.patrimonio_cpu),
      maybeEntry('IP', row.endereco_ip),
      maybeEntry('Modelo', row.modelo),
      maybeEntry('Memória', row.memoria_ram),
      maybeEntry('Armazenamento', row.armazenamento),
      maybeEntry('Processador', row.processador),
      maybeEntry('Setor', row.setor_rel?.nome),
      maybeEntry('Localidade', row.localidade_rel?.nome),
      maybeEntry('Colaboradores ativos', row.alocacoes.map(alocacao => collaboratorName(alocacao.colaborador)).filter(Boolean).join(', ')),
      maybeEntry('Última revisão', row.data_revisao ?? row.checklist_revisado_em),
    ])
  }

  if (tipo === 'RAMAL') {
    const row = await prisma.ramais.findUnique({
      where: { id: item.referencia_id },
      include: {
        setor_rel: { select: { nome: true } },
        localidade_rel: { select: { nome: true } },
        alocacoes: {
          where: { ativo: true },
          include: { colaborador: { select: { nome: true, codigo: true } } },
        },
      },
    })
    if (!row) return []
    return compactEntries([
      maybeEntry('Ramal', row.numero_ramal),
      maybeEntry('Setor', row.setor_rel?.nome),
      maybeEntry('Localidade', row.localidade_rel?.nome),
      maybeEntry('Colaboradores ativos', row.alocacoes.map(alocacao => collaboratorName(alocacao.colaborador)).filter(Boolean).join(', ')),
      maybeEntry('Última revisão', row.checklist_revisado_em),
    ])
  }

  if (tipo === 'IMPRESSORA') {
    const row = await prisma.impressoras.findUnique({
      where: { id: item.referencia_id },
      include: {
        setor_rel: { select: { nome: true } },
        localidade_rel: { select: { nome: true } },
      },
    })
    if (!row) return []
    return compactEntries([
      maybeEntry('Nome/Rede', row.nome_host),
      maybeEntry('IP', row.endereco_ip),
      maybeEntry('Modelo', row.modelo),
      maybeEntry('Patrimônio', row.identificador_selb),
      maybeEntry('Setor', row.setor_rel?.nome),
      maybeEntry('Localidade', row.localidade_rel?.nome),
      maybeEntry('Última revisão', row.revisao ?? row.checklist_revisado_em),
    ])
  }

  const row = await delegate('monitores').findUnique({
    where: { id: item.referencia_id },
    include: {
      alocacoes: {
        where: { ativo: true },
        include: { maquina: { select: { nome_host: true, patrimonio_cpu: true, setor_rel: { select: { nome: true } } } } },
      },
    },
  })
  if (!row) return []
  const maquinaAtual = row.alocacoes?.map((alocacao: any) => alocacao.maquina?.nome_host ?? alocacao.maquina?.patrimonio_cpu).filter(Boolean).join(', ')
  const setorAtual = row.alocacoes?.map((alocacao: any) => alocacao.maquina?.setor_rel?.nome).filter(Boolean).join(', ')
  return compactEntries([
    maybeEntry('Patrimônio', row.patrimonio),
    maybeEntry('Marca', row.marca),
    maybeEntry('Tamanho', row.modelo),
    maybeEntry('Status', row.status),
    maybeEntry('Máquina atual', maquinaAtual),
    maybeEntry('Setor atual', setorAtual),
    maybeEntry('Última revisão', row.checklist_revisado_em),
  ])
}

async function primaryIncidenceForItem(item: any): Promise<{
  checked: boolean
  match_id: string | null
  match_title: string | null
  snapshot: ReviewSnapshotEntry[]
}> {
  const tipo = item.tipo_item as TipoItem
  const data = itemData(item)
  let row: any = null

  if (tipo === 'MAQUINA') {
    const host = text(data.hostname) ?? text(data.nome_host) ?? text(data.maquina_hostname)
    const ip = text(data.ip) ?? text(data.endereco_ip)
    const conditions = [
      host ? { nome_host: { equals: host, mode: 'insensitive' } } : undefined,
      ip ? { endereco_ip: ip } : undefined,
    ].filter(Boolean) as any[]
    if (conditions.length === 0) return { checked: false, match_id: null, match_title: null, snapshot: [] }
    row = await prisma.maquinas.findFirst({ where: { OR: conditions }, select: { id: true } })
  } else if (tipo === 'RAMAL') {
    const numero = text(data.numero_ramal) ?? text(data.numero) ?? text(data.ramal_estacao)
    if (!numero) return { checked: false, match_id: null, match_title: null, snapshot: [] }
    row = await prisma.ramais.findFirst({ where: { numero_ramal: numero }, select: { id: true } })
  } else if (tipo === 'MONITOR') {
    const patrimonio = text(data.patrimonio)
    if (!patrimonio) return { checked: false, match_id: null, match_title: null, snapshot: [] }
    row = await delegate('monitores').findFirst({ where: { patrimonio }, select: { id: true } })
  } else if (tipo === 'IMPRESSORA') {
    const host = text(data.nome_rede) ?? text(data.nome_host)
    const serial = text(data.numero_serie) ?? text(data.serial)
    const conditions = [
      host ? { nome_host: { equals: host, mode: 'insensitive' } } : undefined,
      serial ? { numero_serie: serial } : undefined,
    ].filter(Boolean) as any[]
    if (conditions.length === 0) return { checked: false, match_id: null, match_title: null, snapshot: [] }
    row = await prisma.impressoras.findFirst({ where: { OR: conditions }, select: { id: true } })
  }

  if (!row?.id) return { checked: true, match_id: null, match_title: null, snapshot: [] }
  const matchItem = { ...item, referencia_id: row.id }
  const [matchTitle, snapshot] = await Promise.all([
    referenceTitleForItem(matchItem),
    referenceSnapshotForItem(matchItem),
  ])
  return { checked: true, match_id: row.id, match_title: matchTitle, snapshot }
}

async function submittedSnapshotForItem(item: any): Promise<ReviewSnapshotEntry[]> {
  const tipo = item.tipo_item as TipoItem
  const data = itemData(item)
  const setor = await setorLabel(data.setor_id)
  const localidade = await localidadeLabel(data.localidade_id)
  const colaboradores = await colaboradorLabels(data.colaboradores_estacao_ids)

  if (tipo === 'MAQUINA') {
    const explicitEmpty = String(data.colaboradores_estacao ?? '').toLowerCase().includes('sem colaborador')
    return compactEntries([
      maybeEntry('Host', data.hostname ?? data.nome_host),
      maybeEntry('Patrimônio', data.patrimonio),
      maybeEntry('IP', data.ip ?? data.endereco_ip),
      maybeEntry('Modelo', data.modelo),
      maybeEntry('Memória', data.memoria),
      maybeEntry('Armazenamento', data.armazenamento),
      maybeEntry('Processador', data.processador),
      maybeEntry('Setor', setor),
      maybeEntry('Localidade', localidade),
      maybeEntry('Colaboradores propostos', colaboradores ?? (explicitEmpty ? 'Sem colaborador' : null)),
      maybeEntry('Ramal da estação', data.ramal_estacao),
      maybeEntry('Observações', data.observacoes),
    ])
  }

  if (tipo === 'RAMAL') {
    const explicitEmpty = String(data.colaboradores_estacao ?? '').toLowerCase().includes('sem colaborador')
    return compactEntries([
      maybeEntry('Ramal', data.numero_ramal ?? data.numero ?? data.ramal_estacao),
      maybeEntry('Estação', stationRefFromData(data)),
      maybeEntry('Setor', setor),
      maybeEntry('Localidade', localidade),
      maybeEntry('Colaboradores propostos', colaboradores ?? (explicitEmpty ? 'Sem colaborador' : null)),
      maybeEntry('Observações', data.observacoes),
    ])
  }

  if (tipo === 'IMPRESSORA') {
    return compactEntries([
      maybeEntry('Nome/Rede', data.nome_rede ?? data.nome_host),
      maybeEntry('IP', data.ip ?? data.endereco_ip),
      maybeEntry('Modelo', data.modelo),
      maybeEntry('Patrimônio', data.patrimonio),
      maybeEntry('Status', data.status_observado ?? data.status),
      maybeEntry('Setor', setor),
      maybeEntry('Localidade', localidade),
      maybeEntry('Observações', data.observacoes),
    ])
  }

  return compactEntries([
    maybeEntry('Patrimônio', data.patrimonio),
    maybeEntry('Marca', data.marca),
    maybeEntry('Tamanho', data.tamanho ?? data.modelo),
    maybeEntry('Estação', stationRefFromData(data)),
    maybeEntry('Máquina informada', data.maquina_hostname ?? await maquinaLabel(data.maquina_id)),
    maybeEntry('Setor', setor),
    maybeEntry('Colaboradores propostos', colaboradores),
    maybeEntry('Observações', data.observacoes),
  ])
}

async function labelForDiffValue(diff: any, item: any, value: unknown, side: 'atual' | 'informado') {
  if (diff.campo === '_item') {
    if (side === 'atual') {
      if (diff.tipo_diff === 'novo') return 'Sem correspondência primária no inventário'
      return await referenceTitleForItem(item) ?? 'Ativo localizado no inventário'
    }
    if (diff.tipo_diff === 'ausente') return 'Não informado no checklist'
    return submittedTitleForItem(item)
  }

  if (diff.campo === 'setor_id') return setorLabel(value)
  if (diff.campo === 'localidade_id') return localidadeLabel(value)
  if (diff.campo === 'maquina_id') return maquinaLabel(value)
  if (diff.campo === 'colaborador_id') return colaboradorLabels(value) ?? displayValue(value)
  if (isUuid(value)) return 'Referência vinculada'
  return displayValue(value)
}

export async function enrichSolicitacaoForReview(row: any) {
  if (!row?.itens?.length) return row
  const stationCollaboratorData = new Map<string, { nomes?: unknown; ids?: unknown }>()
  for (const item of row.itens) {
    if (item.tipo_item !== 'MAQUINA') continue
    const data = itemData(item)
    const station = stationRefFromData(data)
    if (!station) continue
    stationCollaboratorData.set(station, {
      nomes: data.colaboradores_estacao,
      ids: data.colaboradores_estacao_ids,
    })
  }
  const itens = await Promise.all(row.itens.map(async (item: any) => {
    const data = itemData(item)
    const station = stationRefFromData(data)
    const stationCollaborators = station ? stationCollaboratorData.get(station) : null
    const enrichedItem = stationCollaborators && item.tipo_item !== 'MAQUINA' && !data.colaboradores_estacao_ids && !data.colaboradores_estacao
      ? {
        ...item,
        dados_informados_json: {
          ...data,
          colaboradores_estacao: stationCollaborators.nomes,
          colaboradores_estacao_ids: stationCollaborators.ids,
        },
      }
      : item
    const [referenciaSnapshot, informadoSnapshot, incidenciaPrimaria] = await Promise.all([
      referenceSnapshotForItem(enrichedItem),
      submittedSnapshotForItem(enrichedItem),
      primaryIncidenceForItem(enrichedItem),
    ])
    const diffs = await Promise.all((enrichedItem.diffs ?? []).map(async (diff: any) => ({
      ...diff,
      valor_atual_label: await labelForDiffValue(diff, enrichedItem, diff.valor_atual, 'atual'),
      valor_informado_label: await labelForDiffValue(diff, enrichedItem, diff.valor_informado, 'informado'),
    })))
    return {
      ...enrichedItem,
      referencia_snapshot: referenciaSnapshot,
      dados_informados_snapshot: informadoSnapshot,
      incidencia_primaria_snapshot: incidenciaPrimaria.snapshot,
      incidencia_primaria_titulo: incidenciaPrimaria.match_title,
      novo_primario: incidenciaPrimaria.checked && !incidenciaPrimaria.match_id,
      diffs,
    }
  }))
  return { ...row, itens }
}

export async function assimilarRack(solicitacaoId: string, user: UserRef) {
  await ensureSolicitacaoRevisable(solicitacaoId)
  await ensureSolicitacaoNotAssimilated(solicitacaoId)
  const solicitacao = await delegate('checklists_validacao_solicitacoes').findUnique({
    where: { id: solicitacaoId },
    include: { rack_resposta: true },
  })
  if (!solicitacao) throw new ChecklistError('Solicitação não encontrada', 404)
  if (solicitacao.tipo_solicitacao !== 'RACK') throw new ChecklistError('Assimilação de rack inválida')
  if (solicitacao.status_revisao !== 'aprovado') throw new ChecklistError('Rack precisa estar aprovado para assimilação', 409)
  if (!solicitacao.rack_resposta) throw new ChecklistError('Resposta de rack não encontrada', 404)

  const data = solicitacao.rack_resposta.dados_informados_json ?? {}
  const allowed = { ...data }
  delete allowed.portas_livres
  const updated = await prisma.racks.update({
    where: { id: solicitacao.rack_id },
    data: {
      nome_switch: allowed.nome_switch ?? undefined,
      localizacao: allowed.localizacao ?? undefined,
      quantidade_portas: allowed.quantidade_portas == null ? undefined : Number(allowed.quantidade_portas),
      portas_em_uso: allowed.portas_em_uso == null ? undefined : Number(allowed.portas_em_uso),
      portas_academicas: allowed.portas_academicas ?? undefined,
      portas_vlan_impressoras: allowed.portas_vlan_impressoras ?? undefined,
      checklist_ultima_id: solicitacao.checklist_validacao_id,
      checklist_tecnico_id: solicitacao.assumido_por,
      checklist_revisor_id: user.id ?? null,
      checklist_validado_em: new Date(),
    } as any,
  })
  await delegate('checklists_validacao_solicitacoes').update({ where: { id: solicitacaoId }, data: { status: 'revisada', revisado_por: user.id ?? null, revisado_em: new Date() } })
  await registrarAuditoria({
    tabela: 'racks',
    registro_id: updated.id,
    acao: 'UPDATE',
    descricao: 'Rack assimilado por checklist',
    dados_novos: updated as any,
    usuario_id: user.id ?? null,
    usuario_nome: user.nome ?? null,
  })
  await registrarAuditoria({
    tabela: 'checklists_validacao_solicitacoes',
    registro_id: solicitacaoId,
    acao: 'APROVAR',
    descricao: 'Rack aprovado assimilado ao inventário',
    dados_novos: { rack_id: updated.id },
    usuario_id: user.id ?? null,
    usuario_nome: user.nome ?? null,
  })
  return updated
}

export function sanitizeSolicitacao(row: any) {
  return {
    ...row,
    setor_nome: row.setor?.nome ?? null,
    rack_nome: row.rack?.nome_switch ?? null,
    tecnico_nome: row.tecnico?.nome ?? null,
    revisor_nome: row.revisor?.nome ?? null,
    assimilada: Boolean(row.assimilada),
    assimilado_por_nome: row.assimilado_por_nome ?? null,
    assimilado_em: row.assimilado_em ?? null,
    itens_count: row._count?.itens ?? 0,
    diffs_count: row._count?.diffs ?? 0,
    cobertura: row.cobertura ?? undefined,
  }
}

function emptyCobertura() {
  return {
    previsto: {
      maquinas: 0,
      ramais: 0,
      monitores: 0,
      impressoras: 0,
      racks: 0,
      portas: 0,
    },
    preenchido: {
      maquinas: 0,
      ramais: 0,
      monitores: 0,
      impressoras: 0,
      rack: 0,
    },
    percentual: 0,
  }
}

export async function calcularCoberturaSolicitacao(solicitacaoInput: any) {
  const solicitacao = solicitacaoInput?.checklist
    ? solicitacaoInput
    : await delegate('checklists_validacao_solicitacoes').findUnique({
      where: { id: solicitacaoInput.id ?? solicitacaoInput },
      include: { checklist: true, rack: true },
    })

  if (!solicitacao) return emptyCobertura()

  const cobertura = emptyCobertura()
  if (solicitacao.tipo_solicitacao === 'RACK') {
    const rack = solicitacao.rack ?? await prisma.racks.findUnique({ where: { id: solicitacao.rack_id } })
    cobertura.previsto.racks = rack ? 1 : 0
    cobertura.previsto.portas = Number(rack?.quantidade_portas ?? 0)
    cobertura.preenchido.rack = await delegate('checklists_validacao_racks_respostas').count({
      where: { checklist_validacao_solicitacao_id: solicitacao.id },
    })
    cobertura.percentual = cobertura.preenchido.rack > 0 ? 100 : 0
    return cobertura
  }

  const localidadeId = solicitacao.checklist?.localidade_id
  const setorId = solicitacao.setor_id
  if (!setorId || !localidadeId) return cobertura

  const [maquinas, ramais, impressoras, monitores, itens] = await Promise.all([
    prisma.maquinas.count({ where: { localidade_id: localidadeId, setor_id: setorId } }),
    prisma.ramais.count({ where: { localidade_id: localidadeId, setor_id: setorId } }),
    prisma.impressoras.count({ where: { localidade_id: localidadeId, setor_id: setorId } }),
    delegate('alocacoes_monitores').count({
      where: {
        ativo: true,
        OR: [
          { setor_id: setorId },
          { maquina: { setor_id: setorId, localidade_id: localidadeId } },
        ],
      },
    }),
    delegate('checklists_validacao_itens').findMany({
      where: { checklist_validacao_solicitacao_id: solicitacao.id },
      select: { tipo_item: true },
    }),
  ])

  cobertura.previsto.maquinas = maquinas
  cobertura.previsto.ramais = ramais
  cobertura.previsto.impressoras = impressoras
  cobertura.previsto.monitores = monitores
  for (const item of itens) {
    if (item.tipo_item === 'MAQUINA') cobertura.preenchido.maquinas += 1
    if (item.tipo_item === 'RAMAL') cobertura.preenchido.ramais += 1
    if (item.tipo_item === 'MONITOR') cobertura.preenchido.monitores += 1
    if (item.tipo_item === 'IMPRESSORA') cobertura.preenchido.impressoras += 1
  }
  const previstoTotal = maquinas + ramais + impressoras + monitores
  const preenchidoTotal = cobertura.preenchido.maquinas + cobertura.preenchido.ramais + cobertura.preenchido.impressoras + cobertura.preenchido.monitores
  cobertura.percentual = previstoTotal > 0 ? Math.min(100, Math.round((preenchidoTotal / previstoTotal) * 100)) : 0
  return cobertura
}
