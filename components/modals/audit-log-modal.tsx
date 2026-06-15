'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, User, Clock, Database, Tag, FileText, ArrowRight, ArrowLeftRight, ExternalLink, UserCheck, UserMinus, MonitorCog } from 'lucide-react'
import type { AuditLog } from '@/lib/audit-constants'
import { ACAO_COLORS, ACAO_LABELS, TABELAS_OPCOES } from '@/lib/audit-constants'
import { AnimatedDialogFrame } from '@/components/layout/motion-primitives'
import { cn } from '@/lib/utils'

interface Props {
  log: AuditLog
  onClose: () => void
}

function formatDateTime(dt: string | null) {
  if (!dt) return '—'
  const d = new Date(dt)
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
}

const CAMPOS_IGNORADOS = new Set(['created_at', 'updated_at'])
const CAMPOS_SECUNDARIOS = new Set([
  'id',
  'usuario_id',
  'autor_id',
  'revisor_id',
  'recurso_id',
  'pasta_id',
])

const FIELD_LABELS: Record<string, string> = {
  id: 'ID',
  acao: 'Ação',
  status: 'Status',
  parecer: 'Parecer',
  recurso_id: 'ID do recurso',
  revisor_id: 'ID do revisor',
  revisado_em: 'Revisado em',
  revisor_nome: 'Revisor',
  tipo_recurso: 'Tipo de recurso',
  dados_propostos: 'Dados propostos',
  comentarios: 'Comentários',
  pasta_id: 'ID da pasta',
  pasta_nome: 'Pasta',
  usuario_id: 'ID do usuário',
  usuario_nome: 'Usuário',
  autor_id: 'ID do autor',
  autor_nome: 'Autor',
  conteudo: 'Conteúdo',
  url_publica: 'Arquivo',
  nome: 'Nome',
  descricao: 'Descrição',
  colaborador_nome: 'Colaborador',
  colaborador_setor: 'Setor do colaborador',
  setor_nome: 'Setor',
  localidade_nome: 'Localidade',
  alocacao_id: 'ID da alocação',
  data_inicio: 'Início da alocação',
  motivo_alocacao: 'Motivo',
  tipo_uso: 'Tipo de uso',
  whatsapp: 'WhatsApp',
  canal_adicional: 'Canal adicional',
  descricao_alocacao: 'Descrição da alocação',
}

const AUDIT_TARGET_ROUTES: Record<string, string> = {
  maquinas: '/maquinas',
  notebooks: '/notebooks',
  aparelhos: '/aparelhos',
  impressoras: '/impressoras',
  ramais: '/ramais',
  racks: '/racks',
  colaboradores: '/colaboradores',
  alocacoes_maquinas: '/maquinas',
  alocacoes_notebooks: '/notebooks',
  alocacoes_aparelhos: '/aparelhos',
  alocacoes_ramais: '/ramais',
  solicitacoes_inventario: '/pedidos',
}

const ALLOCATION_ASSET_KEYS: Record<string, { key: string; route: string; label: string }> = {
  alocacoes_maquinas: { key: 'maquina_id', route: '/maquinas', label: 'máquina' },
  alocacoes_notebooks: { key: 'notebook_id', route: '/notebooks', label: 'notebook' },
  alocacoes_aparelhos: { key: 'aparelho_id', route: '/aparelhos', label: 'aparelho' },
  alocacoes_ramais: { key: 'ramal_id', route: '/ramais', label: 'ramal' },
}

type AssetTarget = {
  href: string
  label: string
  assetId: string
  assetLabel: string
  apiPath: string
}

type LinkTarget = {
  href: string
  label: string
}

function asRecord(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
  return data as Record<string, unknown>
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

function getDisplayKeys(...items: unknown[]) {
  const keys = Array.from(
    new Set(items.flatMap(item => Object.keys(asRecord(item))))
  ).filter(key => !CAMPOS_IGNORADOS.has(key))

  return keys.sort((a, b) => {
    const aSecondary = CAMPOS_SECUNDARIOS.has(a) ? 1 : 0
    const bSecondary = CAMPOS_SECUNDARIOS.has(b) ? 1 : 0
    return aSecondary - bSecondary || a.localeCompare(b, 'pt-BR')
  })
}

function getChangedKeys(anterior: unknown, novo: unknown) {
  const anteriorRecord = asRecord(anterior)
  const novoRecord = asRecord(novo)

  return getDisplayKeys(anterior, novo).filter(key => (
    formatValue(anteriorRecord[key]) !== formatValue(novoRecord[key])
  ))
}

function labelForKey(key: string) {
  return FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function isEmptyValue(value: unknown) {
  return value === null || value === undefined || value === ''
}

function summarizeLongString(value: string) {
  if (value.startsWith('data:image/')) {
    const match = value.match(/^data:image\/([^;]+);base64,/)
    return `Imagem anexada (${(match?.[1] || 'arquivo').toUpperCase()}, ${value.length.toLocaleString('pt-BR')} caracteres)`
  }

  if (value.length <= 260) return value
  return `${value.slice(0, 180)}... (${value.length.toLocaleString('pt-BR')} caracteres)`
}

function AuditValue({ value }: { value: unknown }) {
  if (isEmptyValue(value)) {
    return <span className="text-slate-400">Não informado</span>
  }

  if (typeof value === 'boolean') {
    return <span>{value ? 'Sim' : 'Não'}</span>
  }

  if (typeof value === 'number') {
    return <span>{value.toLocaleString('pt-BR')}</span>
  }

  if (typeof value === 'string') {
    return (
      <span className="whitespace-pre-wrap break-words">
        {summarizeLongString(value)}
      </span>
    )
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-slate-400">Nenhum item</span>

    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          {value.length.toLocaleString('pt-BR')} {value.length === 1 ? 'item' : 'itens'}
        </p>
        {value.slice(0, 4).map((item, index) => (
          <div key={index} className="rounded-md border border-slate-200 bg-white/70 p-2 dark:border-slate-700 dark:bg-slate-950/40">
            <AuditValue value={item} />
          </div>
        ))}
        {value.length > 4 && (
          <p className="text-xs text-slate-400">
            +{(value.length - 4).toLocaleString('pt-BR')} itens adicionais
          </p>
        )}
      </div>
    )
  }

  const entries = Object.entries(asRecord(value)).filter(([key]) => !CAMPOS_IGNORADOS.has(key))
  if (entries.length === 0) return <span className="text-slate-400">Sem detalhes</span>

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {entries.map(([key, nestedValue]) => (
        <div key={key} className="min-w-0 rounded-md bg-slate-100/70 px-2.5 py-2 dark:bg-slate-800/70">
          <p className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
            {labelForKey(key)}
          </p>
          <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">
            <AuditValue value={nestedValue} />
          </p>
        </div>
      ))}
    </div>
  )
}

function getAuditTargetHref(log: AuditLog) {
  const route = AUDIT_TARGET_ROUTES[log.tabela]
  if (!route || !log.registro_id) return null
  return `${route}?inspect=${encodeURIComponent(log.registro_id)}`
}

function getAllocationAssetTarget(tipoRecurso: unknown, fallbackId?: unknown, ...sources: unknown[]): AssetTarget | null {
  if (typeof tipoRecurso !== 'string') return null
  const config = ALLOCATION_ASSET_KEYS[tipoRecurso]
  if (!config) return null

  for (const source of sources) {
    const record = asRecord(source)
    const id = record[config.key]
    if (typeof id === 'string' && id.trim()) {
      return {
        href: `${config.route}?inspect=${encodeURIComponent(id)}`,
        label: `Abrir ${config.label} auditado`,
        assetId: id,
        assetLabel: config.label,
        apiPath: `/api${config.route}/${encodeURIComponent(id)}`,
      }
    }
  }

  if (typeof fallbackId === 'string' && fallbackId.trim()) {
    return {
      href: `${config.route}?inspect=${encodeURIComponent(fallbackId)}`,
      label: `Abrir ${config.label} auditado`,
      assetId: fallbackId,
      assetLabel: config.label,
      apiPath: `/api${config.route}/${encodeURIComponent(fallbackId)}`,
    }
  }

  return null
}

function getAllocationAssetTargetFromLog(log: AuditLog): AssetTarget | null {
  if (!log.tabela.startsWith('alocacoes_')) return null
  const source = log.acao === 'ALOCAR' ? log.dados_novos : log.dados_anteriores
  return getAllocationAssetTarget(log.tabela, log.registro_id, source)
}

function getSolicitacaoPayload(log: AuditLog) {
  const previous = asRecord(log.dados_anteriores)
  const next = asRecord(log.dados_novos)
  const solicitacao = asRecord(next.solicitacao)
  const aplicado = asRecord(next.aplicado)
  const base = Object.keys(solicitacao).length > 0 ? solicitacao : previous

  return { previous, next, solicitacao: base, aplicado }
}

function getSolicitacaoAssetTarget(log: AuditLog) {
  if (log.tabela !== 'solicitacoes_inventario') return null

  const { solicitacao, aplicado } = getSolicitacaoPayload(log)
  return getAllocationAssetTarget(
    solicitacao.tipo_recurso,
    solicitacao.recurso_id,
    aplicado,
    solicitacao.dados_propostos,
    solicitacao.dados_anteriores,
  )
}

function getTargetLabel(log: AuditLog) {
  if (log.tabela.startsWith('alocacoes_')) return 'Abrir ativo auditado'
  if (log.tabela === 'solicitacoes_inventario') return 'Abrir pedido auditado'
  return 'Abrir registro auditado'
}

function TargetLink({ log, href: hrefOverride, label: labelOverride }: { log: AuditLog; href?: string | null; label?: string }) {
  const href = hrefOverride ?? getAuditTargetHref(log)
  if (!href) return null

  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/50"
    >
      <ExternalLink className="h-4 w-4" />
      {labelOverride ?? getTargetLabel(log)}
    </Link>
  )
}

function getColaboradorTarget(...sources: unknown[]): LinkTarget | null {
  for (const source of sources) {
    const record = asRecord(source)
    const id = record.colaborador_id
    if (typeof id === 'string' && id.trim()) {
      return {
        href: `/colaboradores?inspect=${encodeURIComponent(id)}`,
        label: 'Abrir colaborador',
      }
    }
  }

  return null
}

function getAssetTitle(asset: Record<string, unknown>, fallback: AssetTarget) {
  const keys = [
    'recurso_label',
    'nome_host',
    'identificador',
    'numero_patrimonio',
    'modelo',
    'endereco_ip',
    'numero_ramal',
    'nome_switch',
  ]

  for (const key of keys) {
    const value = asset[key]
    if (typeof value === 'string' && value.trim()) return value
  }

  return `${fallback.assetLabel} ${fallback.assetId.slice(0, 8)}`
}

function getAssetFacts(asset: Record<string, unknown>, target: AssetTarget) {
  const fieldByType: Record<string, string[]> = {
    máquina: ['nome_host', 'identificador', 'modelo', 'endereco_ip', 'endereco_mac', 'setor_nome', 'localidade_nome'],
    notebook: ['numero_patrimonio', 'modelo', 'fabricante', 'processador', 'setor_nome', 'localidade_nome'],
    aparelho: ['modelo', 'fabricante', 'endereco_ip', 'endereco_mac', 'chip', 'setor_nome', 'localidade_nome'],
    ramal: ['numero_ramal', 'prefixo_telefonico', 'setor_nome', 'localidade_nome'],
  }
  const keys = fieldByType[target.assetLabel] ?? ['modelo', 'identificador', 'setor_nome', 'localidade_nome']

  return keys
    .map(key => ({ key, value: asset[key] }))
    .filter(item => !isEmptyValue(item.value))
    .slice(0, 6)
}

function AssetSummaryCard({ target, tone }: { target: AssetTarget; tone: 'created' | 'deleted' }) {
  const [asset, setAsset] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setAsset(null)

    fetch(target.apiPath)
      .then(response => response.ok ? response.json() : null)
      .then(json => {
        if (!cancelled && json && typeof json === 'object') setAsset(json as Record<string, unknown>)
      })
      .catch(() => {
        if (!cancelled) setAsset(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [target.apiPath])

  const facts = asset ? getAssetFacts(asset, target) : []
  const title = asset ? getAssetTitle(asset, target) : `${target.assetLabel} auditado`

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        tone === 'created'
          ? 'border-green-200 bg-green-50/80 dark:border-green-900/70 dark:bg-green-950/25'
          : 'border-red-200 bg-red-50/80 dark:border-red-900/70 dark:bg-red-950/25'
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span
            className={cn(
              'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white',
              tone === 'created' ? 'bg-green-600' : 'bg-red-600'
            )}
          >
            <MonitorCog className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Ativo {tone === 'created' ? 'alocado' : 'desalocado'}
            </p>
            <p className="mt-1 break-words text-base font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </p>
            <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
              {target.assetId}
            </p>
          </div>
        </div>
        <TargetLink log={{ tabela: '', registro_id: target.assetId } as AuditLog} href={target.href} label={target.label} />
      </div>

      {loading && (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Carregando informações do ativo...</p>
      )}

      {!loading && facts.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {facts.map(item => (
            <div key={item.key} className="rounded-md bg-white/70 px-3 py-2 dark:bg-slate-950/40">
              <p className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                {labelForKey(item.key)}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                <AuditValue value={item.value} />
              </p>
            </div>
          ))}
        </div>
      )}

      {!loading && !asset && (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          Não foi possível carregar o resumo do ativo, mas o vínculo pelo ID está disponível.
        </p>
      )}
    </div>
  )
}

function FieldRow({
  name,
  value,
  tone = 'default',
  marker,
}: {
  name: string
  value: unknown
  tone?: 'default' | 'created' | 'deleted'
  marker?: string
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3',
        tone === 'created' && 'border-green-200 bg-green-50/80 dark:border-green-900/70 dark:bg-green-950/25',
        tone === 'deleted' && 'border-red-200 bg-red-50/80 dark:border-red-900/70 dark:bg-red-950/25',
        tone === 'default' && 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40',
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        {marker && <span className="text-sm font-bold text-current">{marker}</span>}
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {labelForKey(name)}
        </p>
      </div>
      <div className="text-sm leading-relaxed text-slate-800 dark:text-slate-100">
        <AuditValue value={value} />
      </div>
    </div>
  )
}

function ComparisonPanel({
  data,
  title,
  description,
  changedKeys,
  variant,
}: {
  data: unknown
  title: string
  description: string
  changedKeys: Set<string>
  variant: 'before' | 'after'
}) {
  const record = asRecord(data)
  const changed = getDisplayKeys(data).filter(key => changedKeys.has(key))
  const unchanged = getDisplayKeys(data).filter(key => !changedKeys.has(key))
  const tone = variant === 'before' ? 'deleted' : 'created'
  const marker = variant === 'before' ? '−' : '+'

  return (
    <section className="flex min-h-0 min-w-0 flex-col rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
      <div className="shrink-0 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-5">
        {changed.map(key => (
          <FieldRow key={key} name={key} value={record[key]} tone={tone} marker={marker} />
        ))}

        {changed.length > 0 && unchanged.length > 0 && (
          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Campos não alterados
          </p>
        )}

        {unchanged.map(key => (
          <FieldRow key={key} name={key} value={record[key]} />
        ))}

        {changed.length === 0 && unchanged.length === 0 && (
          <p className="text-xs text-slate-400">Nenhum campo para exibir.</p>
        )}
      </div>
    </section>
  )
}

function JsonComparison({ anterior, novo }: { anterior: unknown; novo: unknown }) {
  const changedKeys = new Set(getChangedKeys(anterior, novo))

  if (!anterior && !novo) return <p className="text-xs text-slate-400">Sem dados disponíveis.</p>

  return (
    <div className="grid min-h-0 w-full gap-4 lg:grid-cols-2">
      <ComparisonPanel
        data={anterior}
        title="Antes da alteração"
        description="Estado registrado antes da auditoria"
        changedKeys={changedKeys}
        variant="before"
      />
      <ComparisonPanel
        data={novo}
        title="Depois da alteração"
        description="Estado salvo após a auditoria"
        changedKeys={changedKeys}
        variant="after"
      />
    </div>
  )
}

function JsonView({ data, highlight }: { data: unknown; highlight?: 'created' | 'deleted' | 'default' }) {
  if (!data) return <p className="text-xs text-slate-400">—</p>

  const record = asRecord(data)
  const keys = getDisplayKeys(data)
  const tone = highlight === 'created' ? 'created' : highlight === 'deleted' ? 'deleted' : 'default'

  return (
    <div className="space-y-3">
      {keys.map(key => (
        <FieldRow key={key} name={key} value={record[key]} tone={tone} />
      ))}
      {keys.length === 0 && (
        <p className="text-xs text-slate-400">Nenhum campo para exibir.</p>
      )}
    </div>
  )
}

function AllocationAuditView({ log }: { log: AuditLog }) {
  const isAllocation = log.acao === 'ALOCAR'
  const data = isAllocation ? log.dados_novos : log.dados_anteriores
  const record = asRecord(data)
  const tone = isAllocation ? 'created' : 'deleted'
  const Icon = isAllocation ? UserCheck : UserMinus
  const title = isAllocation ? 'Ativo alocado' : 'Ativo desalocado'
  const description = isAllocation
    ? 'Este registro mostra para quem o ativo passou a ficar vinculado.'
    : 'Este registro mostra de qual colaborador o ativo foi removido.'
  const assetTarget = getAllocationAssetTargetFromLog(log)
  const colaboradorTarget = getColaboradorTarget(record)

  return (
    <div className="space-y-4">
      {assetTarget && <AssetSummaryCard target={assetTarget} tone={tone} />}

      <div
        className={cn(
          'rounded-lg border p-4',
          isAllocation
            ? 'border-green-200 bg-green-50/80 dark:border-green-900/70 dark:bg-green-950/25'
            : 'border-red-200 bg-red-50/80 dark:border-red-900/70 dark:bg-red-950/25'
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <span
              className={cn(
                'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white',
                isAllocation ? 'bg-green-600' : 'bg-red-600'
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{description}</p>
              {log.descricao && (
                <p className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-100">{log.descricao}</p>
              )}
            </div>
          </div>
          {colaboradorTarget && (
            <TargetLink log={log} href={colaboradorTarget.href} label={colaboradorTarget.label} />
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <FieldRow name="registro_id" value={assetTarget?.assetId ?? log.registro_id} />
        <FieldRow name="colaborador_nome" value={record.colaborador_nome} tone={tone} />
        <FieldRow name="colaborador_setor" value={record.colaborador_setor} />
        <FieldRow name="data_inicio" value={record.data_inicio} />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Detalhes registrados
          </h4>
        </div>
        <JsonView data={data} highlight={tone} />
      </div>
    </div>
  )
}

function SolicitacaoAppliedView({ log }: { log: AuditLog }) {
  const { solicitacao, aplicado } = getSolicitacaoPayload(log)
  const isAllocationResource = typeof solicitacao.tipo_recurso === 'string' && solicitacao.tipo_recurso.startsWith('alocacoes_')
  const isAllocationRequest = isAllocationResource && (solicitacao.acao === 'ALLOCATE' || solicitacao.acao === 'CREATE')
  const isDeallocationRequest = solicitacao.acao === 'DEALLOCATE'
  const allocationTarget = getSolicitacaoAssetTarget(log)
  const proposed = asRecord(solicitacao.dados_propostos)
  const previous = asRecord(solicitacao.dados_anteriores)
  const colaboradorTarget = getColaboradorTarget(aplicado, proposed, previous)
  const hasAppliedData = Object.keys(aplicado).length > 0

  if (!isAllocationRequest && !isDeallocationRequest && !hasAppliedData) {
    return null
  }

  const tone = isDeallocationRequest ? 'deleted' : 'created'
  const Icon = isDeallocationRequest ? UserMinus : UserCheck
  const title = isDeallocationRequest
    ? 'Item desalocado pela solicitação'
    : isAllocationRequest
      ? 'Item alocado pela solicitação'
      : 'Item aplicado pela solicitação'
  const description = allocationTarget
    ? `A solicitação afetou este ${allocationTarget.assetLabel}.`
    : 'A solicitação foi aplicada e gerou alteração no inventário.'

  return (
      <div className="space-y-4">
      {allocationTarget && <AssetSummaryCard target={allocationTarget} tone={tone} />}

      <div
        className={cn(
          'rounded-lg border p-4',
          tone === 'created'
            ? 'border-green-200 bg-green-50/80 dark:border-green-900/70 dark:bg-green-950/25'
            : 'border-red-200 bg-red-50/80 dark:border-red-900/70 dark:bg-red-950/25'
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <span
              className={cn(
                'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white',
                tone === 'created' ? 'bg-green-600' : 'bg-red-600'
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{description}</p>
              {log.descricao && (
                <p className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-100">{log.descricao}</p>
              )}
            </div>
          </div>
          {colaboradorTarget && (
            <TargetLink log={log} href={colaboradorTarget.href} label={colaboradorTarget.label} />
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <FieldRow name="tipo_recurso" value={solicitacao.tipo_recurso} />
        <FieldRow name="acao" value={solicitacao.acao} tone={tone} />
        <FieldRow name="recurso_id" value={allocationTarget?.assetId ?? solicitacao.recurso_id} />
        <FieldRow name="colaborador_nome" value={aplicado.colaborador_nome ?? proposed.colaborador_nome ?? previous.colaborador_nome} tone={tone} />
      </div>
    </div>
  )
}

export function AuditLogModal({ log, onClose }: Props) {
  const moduloLabel = TABELAS_OPCOES.find(t => t.value === log.tabela)?.label || log.tabela
  const acaoLabel = ACAO_LABELS[log.acao] || log.acao
  const acaoCor = ACAO_COLORS[log.acao] || 'bg-slate-100 text-slate-600'

  const isUpdate = log.acao === 'UPDATE' || log.acao === 'EDITAR_ALOCACAO'
  const temAnterior = !!log.dados_anteriores
  const temNovo = !!log.dados_novos
  const isComparable = isUpdate && temAnterior && temNovo
  const dialogWidthClass = isComparable ? 'max-w-6xl bg-transparent shadow-none overflow-visible' : 'max-w-3xl'
  const headerTarget = log.tabela.startsWith('alocacoes_')
    ? null
    : log.tabela === 'solicitacoes_inventario' && log.acao === 'APROVAR'
      ? null
      : getAuditTargetHref(log)

  return (
    <AnimatedDialogFrame onClose={onClose} className={dialogWidthClass}>
      <div className={cn(
        'flex max-h-[90vh] min-h-0 min-w-0 flex-col overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-slate-900',
        isComparable && 'bg-transparent shadow-none dark:bg-transparent'
      )}>

        {/* Header */}
        <div className="flex shrink-0 items-start justify-between rounded-t-lg border-b border-slate-100 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${acaoCor}`}>
                {acaoLabel}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">em</span>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                {moduloLabel}
              </span>
            </div>
            {log.descricao && (
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-snug max-w-sm">
                {log.descricao}
              </p>
            )}
          </div>
          <div className="ml-3 flex shrink-0 items-center gap-2">
            {headerTarget && <TargetLink log={log} href={headerTarget} />}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Meta info */}
        <div className="grid shrink-0 grid-cols-1 gap-0 border-b border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2">
          <div className="flex items-center gap-2.5 px-5 py-3 border-r border-slate-100 dark:border-slate-800">
            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">Data/Hora</p>
              <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">{formatDateTime(log.created_at)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 px-5 py-3">
            <User className="w-4 h-4 text-slate-400 shrink-0" />
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">Responsável</p>
              <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">{log.usuario_nome || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 px-5 py-3 border-t border-r border-slate-100 dark:border-slate-800">
            <Database className="w-4 h-4 text-slate-400 shrink-0" />
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">Módulo</p>
              <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">{moduloLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 px-5 py-3 border-t border-slate-100 dark:border-slate-800">
            <Tag className="w-4 h-4 text-slate-400 shrink-0" />
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">ID do Registro</p>
              <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5 font-mono truncate max-w-[160px]" title={log.registro_id}>
                {log.registro_id}
              </p>
            </div>
          </div>
        </div>

        {/* Dados */}
        <div className={cn(
          'min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-white p-5 dark:bg-slate-900',
          isComparable && 'bg-transparent dark:bg-transparent'
        )}>

          {/* UPDATE / EDITAR_ALOCACAO — diff side a side */}
          {isUpdate && temAnterior && temNovo && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ArrowLeftRight className="w-4 h-4 text-slate-400" />
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Comparação da alteração
                </h3>
              </div>
              <JsonComparison anterior={log.dados_anteriores} novo={log.dados_novos} />
            </div>
          )}

          {/* CREATE — só dados novos */}
          {log.acao === 'CREATE' && temNovo && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-slate-400" />
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Dados criados
                </h3>
              </div>
              <JsonView data={log.dados_novos} highlight="created" />
            </div>
          )}

          {/* DELETE — só dados anteriores */}
          {log.acao === 'DELETE' && temAnterior && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-slate-400" />
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Dados excluídos
                </h3>
              </div>
              <JsonView data={log.dados_anteriores} highlight="deleted" />
            </div>
          )}

          {/* ALOCAR / DESALOCAR */}
          {(log.acao === 'ALOCAR' || log.acao === 'DESALOCAR') && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ArrowRight className="w-4 h-4 text-slate-400" />
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Dados da {log.acao === 'ALOCAR' ? 'alocação' : 'desalocação'}
                </h3>
              </div>
              <AllocationAuditView log={log} />
            </div>
          )}

          {/* Fallback — dados individuais para ações não mapeadas */}
          {!isComparable && log.acao !== 'CREATE' && log.acao !== 'DELETE' && log.acao !== 'ALOCAR' && log.acao !== 'DESALOCAR' && (temNovo || temAnterior) && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-slate-400" />
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Dados registrados
                </h3>
              </div>
              {log.tabela === 'solicitacoes_inventario' && log.acao === 'APROVAR' && (
                <div className="mb-5">
                  <SolicitacaoAppliedView log={log} />
                </div>
              )}
              <JsonView data={temNovo ? log.dados_novos : log.dados_anteriores} />
            </div>
          )}

          {/* Fallback — sem dados estruturados */}
          {!temAnterior && !temNovo && (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <FileText className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-xs">Sem dados detalhados disponíveis.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 p-4 border-t border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </AnimatedDialogFrame>
  )
}
