'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  File,
  FileImage,
  FileUp,
  FileText,
  GitPullRequest,
  Loader2,
  MessageCircle,
  Send,
  ShieldAlert,
  X,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { usePermission } from '@/hooks/use-permission'
import { AnimatedSheetFrame } from '@/components/layout/motion-primitives'
import { OverviewExportMenu, type OverviewExportConfig } from '@/components/tables/overview-export-menu'
import { cn } from '@/lib/utils'
import {
  buildHref,
  buildInspectHref,
  inferInspectPreview,
  removeInspectHref,
  writePendingInspectPreview,
} from '@/lib/navigation-context'

type JsonRecord = Record<string, unknown>

type PedidoStatus = 'pendente' | 'aprovada' | 'recusada'
type PedidoKind = 'inventario' | 'upload'

type Pedido = {
  id: string
  status: PedidoStatus
  tipo_recurso: string
  recurso_id: string | null
  acao: string
  dados_anteriores: JsonRecord | null
  dados_propostos: JsonRecord | null
  solicitante_nome: string | null
  revisor_nome: string | null
  parecer: string | null
  comentarios: PedidoComentario[] | null
  erro_aplicacao: string | null
  created_at: string | null
  revisado_em: string | null
}

type PedidoComentario = {
  id?: string
  autor_id?: string | null
  autor_nome?: string | null
  papel?: 'solicitante' | 'revisor' | string
  conteudo?: string
  created_at?: string
}

type DiffRow = {
  key: string
  label: string
  before: unknown
  after: unknown
}

type InspectTarget = {
  path: string
  id: string
  title: string
  subtitle?: string
  href?: string
}

const RESOURCE_LABELS: Record<string, string> = {
  maquinas: 'Máquinas',
  notebooks: 'Notebooks',
  aparelhos: 'Aparelhos',
  impressoras: 'Impressoras',
  ramais: 'Ramais',
  racks: 'Racks',
  colaboradores: 'Colaboradores',
  alocacoes_maquinas: 'Alocações — Máquinas',
  alocacoes_notebooks: 'Alocações — Notebooks',
  alocacoes_aparelhos: 'Alocações — Aparelhos',
  alocacoes_ramais: 'Alocações — Ramais',
  forum_arquivos: 'Uploads de arquivos',
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Criação',
  UPDATE: 'Edição',
  DELETE: 'Exclusão',
  ALLOCATE: 'Alocação',
  DEALLOCATE: 'Desalocação',
  CORRECTION: 'Correção',
  UPLOAD: 'Upload de arquivo',
}

const KIND_META: Record<PedidoKind, { label: string; description: string; tone: string; icon: typeof Database }> = {
  inventario: {
    label: 'Inventário',
    description: 'Alterações de dispositivos, vínculos e cadastros',
    tone: 'border-blue-500/30 bg-blue-500/10 text-blue-100',
    icon: Database,
  },
  upload: {
    label: 'Arquivos',
    description: 'Arquivos enviados para Documentos do Fórum',
    tone: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100',
    icon: FileUp,
  },
}

const FIELD_LABELS: Record<string, string> = {
  nome: 'Nome',
  codigo: 'Código',
  codigo_pessoa: 'Código de pessoa',
  email: 'E-mail',
  status: 'Status',
  ativo: 'Ativo',
  setor_id: 'Setor',
  localidade_id: 'Localidade',
  colaborador_id: 'Colaborador',
  maquina_id: 'Máquina',
  notebook_id: 'Notebook',
  aparelho_id: 'Aparelho',
  impressora_id: 'Impressora',
  ramal_id: 'Ramal',
  rack_id: 'Rack',
  nome_host: 'Host',
  endereco_ip: 'IP',
  identificador: 'Identificador',
  modelo: 'Modelo',
  fabricante: 'Fabricante',
  numero_patrimonio: 'Patrimônio',
  numero_ramal: 'Ramal',
  disponibilidade: 'Disponibilidade',
  data_inicio: 'Data de início',
  data_fim: 'Data de fim',
  motivo_alocacao: 'Motivo',
  observacoes: 'Observações',
  tipo_uso: 'Tipo de uso',
  tipo_posse: 'Tipo de posse',
  nome_original: 'Arquivo',
  pasta_nome: 'Pasta',
  tipo_arquivo: 'Tipo',
  tamanho_bytes: 'Tamanho',
}

const DISPLAY_ONLY_KEYS = new Set([
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
  'nome_armazenado',
  'url_publica',
  'usuario_id',
  'enviado_por_nome',
  'pasta_id',
])

const STATUS_META: Record<PedidoStatus, { label: string; tone: string; icon: typeof Clock3 }> = {
  pendente: { label: 'Pendentes', tone: 'border-amber-500/30 bg-amber-500/10 text-amber-200', icon: Clock3 },
  aprovada: { label: 'Aprovados', tone: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200', icon: CheckCircle2 },
  recusada: { label: 'Recusados', tone: 'border-rose-500/30 bg-rose-500/10 text-rose-200', icon: XCircle },
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function relationLabel(source: JsonRecord, key: string) {
  const relationKey = key.replace(/_id$/, '')
  const labelKey = `${relationKey}_label`
  const nameKey = `${relationKey}_nome`
  const relationValue = source[relationKey]
  const relationRel = source[`${relationKey}_rel`]

  for (const value of [source[labelKey], source[nameKey]]) {
    if (value !== null && value !== undefined && String(value).trim()) return String(value)
  }

  if (isRecord(relationValue)) {
    for (const nestedKey of ['nome', 'endereco_ip', 'nome_host', 'numero_ramal', 'nome_switch', 'modelo']) {
      const value = relationValue[nestedKey]
      if (value !== null && value !== undefined && String(value).trim()) return String(value)
    }
  }

  if (isRecord(relationRel)) {
    const value = relationRel.nome
    if (value !== null && value !== undefined && String(value).trim()) return String(value)
  }

  return null
}

function formatValue(value: unknown, key: string, source: JsonRecord) {
  if (key === 'tamanho_bytes' && typeof value === 'number') {
    if (value < 1024) return `${value} B`
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
    return `${(value / (1024 * 1024)).toFixed(1)} MB`
  }
  if (key.endsWith('_id')) {
    const label = relationLabel(source, key)
    if (label) return label
  }
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (value instanceof Date) return formatDate(value.toISOString())
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat('pt-BR').format(date)
    }
  }
  if (isRecord(value)) {
    for (const nestedKey of ['nome', 'endereco_ip', 'nome_host', 'numero_ramal', 'modelo']) {
      const nestedValue = value[nestedKey]
      if (nestedValue !== null && nestedValue !== undefined && String(nestedValue).trim()) {
        return String(nestedValue)
      }
    }
    return 'Informação vinculada'
  }
  return String(value)
}

function pedidoKind(pedido: Pedido): PedidoKind {
  return pedido.tipo_recurso === 'forum_arquivos' ? 'upload' : 'inventario'
}

function getPedidoArquivoInfo(pedido: Pedido) {
  if (pedido.tipo_recurso !== 'forum_arquivos' || pedido.acao !== 'UPLOAD') return null
  const dados = pedido.dados_propostos ?? {}
  const nome = typeof dados.nome_original === 'string' ? dados.nome_original : ''
  if (!nome) return null

  return {
    nome,
    tipo: typeof dados.tipo_arquivo === 'string' ? dados.tipo_arquivo : '',
    tamanho: formatValue(dados.tamanho_bytes, 'tamanho_bytes', dados),
    href: `/api/solicitacoes-inventario/${pedido.id}/arquivo`,
  }
}

function renderPedidoArquivoIcon(mime: string) {
  if (mime.startsWith('image/')) return <FileImage className="h-5 w-5" />
  if (mime === 'application/pdf') return <FileText className="h-5 w-5" />
  return <File className="h-5 w-5" />
}

function reviewKeys(pedido: Pedido) {
  const previous = pedido.dados_anteriores ?? {}
  const next = pedido.dados_propostos ?? {}
  if (pedido.tipo_recurso === 'forum_arquivos' && pedido.acao === 'UPLOAD') {
    return ['nome_original', 'pasta_nome', 'tipo_arquivo', 'tamanho_bytes'].filter(key => key in next)
  }

  const proposedKeys = Object.keys(next).filter(key => !DISPLAY_ONLY_KEYS.has(key))

  if (pedido.acao === 'DELETE' || pedido.acao === 'DEALLOCATE') {
    return proposedKeys.length > 0
      ? proposedKeys
      : ['ativo', 'data_fim'].filter(key => key in previous || key in next)
  }

  if (proposedKeys.length > 0) {
    return proposedKeys.filter(key => JSON.stringify(previous[key]) !== JSON.stringify(next[key]))
  }

  return Array.from(new Set([...Object.keys(previous), ...Object.keys(next)]))
    .filter(key => !DISPLAY_ONLY_KEYS.has(key))
    .filter(key => JSON.stringify(previous[key]) !== JSON.stringify(next[key]))
}

function diffRows(pedido: Pedido): DiffRow[] {
  const previous = pedido.dados_anteriores ?? {}
  const next = pedido.dados_propostos ?? {}

  return reviewKeys(pedido).map(key => ({
    key,
    label: FIELD_LABELS[key] ?? key.replace(/_/g, ' '),
    before: previous[key],
    after: next[key],
  }))
}

function targetLabel(pedido: Pedido) {
  const previous = pedido.dados_anteriores ?? {}
  const next = pedido.dados_propostos ?? {}
  const candidates = [
    next.recurso_label,
    previous.recurso_label,
    previous.endereco_ip,
    previous.nome_host,
    previous.nome,
    previous.numero_ramal,
    previous.nome_switch,
    previous.numero_patrimonio,
    previous.modelo,
    previous.nome_original,
    previous.pasta_nome,
    next.endereco_ip,
    next.nome_host,
    next.nome,
    next.numero_ramal,
    next.nome_switch,
    next.numero_patrimonio,
    next.modelo,
    next.nome_original,
    next.pasta_nome,
  ]
  const match = candidates.find(value => value !== null && value !== undefined && String(value).trim())
  return match ? String(match) : RESOURCE_LABELS[pedido.tipo_recurso] ?? pedido.tipo_recurso
}

function requestSummary(pedido: Pedido) {
  const rows = diffRows(pedido)
  if (pedido.tipo_recurso === 'forum_arquivos' && pedido.acao === 'UPLOAD') {
    const next = pedido.dados_propostos ?? {}
    const fileName = String(next.nome_original ?? 'arquivo')
    const folderName = String(next.pasta_nome ?? 'Documentos')
    return `Enviar "${fileName}" para ${folderName}`
  }
  if (pedido.acao === 'DELETE') return `Excluir ${targetLabel(pedido)}`
  if (pedido.acao === 'DEALLOCATE') return `Encerrar vínculo de ${targetLabel(pedido)}`
  if (rows.length === 0) return 'Sem mudanças estruturadas detectadas'

  return rows
    .slice(0, 2)
    .map(row => {
      const previous = pedido.dados_anteriores ?? {}
      const next = pedido.dados_propostos ?? {}
      return `${row.label}: ${formatValue(row.before, row.key, previous)} → ${formatValue(row.after, row.key, next)}`
    })
    .join(' · ')
}

function firstString(...values: unknown[]) {
  const found = values.find(value => typeof value === 'string' && value.trim())
  return found ? String(found) : ''
}

function getPedidoInspectTarget(pedido: Pedido): InspectTarget | null {
  const previous = pedido.dados_anteriores ?? {}
  const next = pedido.dados_propostos ?? {}
  const resourceMap: Record<string, string> = {
    maquinas: '/maquinas',
    notebooks: '/notebooks',
    aparelhos: '/aparelhos',
    impressoras: '/impressoras',
    ramais: '/ramais',
    racks: '/racks',
    colaboradores: '/colaboradores',
  }

  const directPath = resourceMap[pedido.tipo_recurso]
  if (directPath && pedido.recurso_id) {
    return {
      path: directPath,
      id: pedido.recurso_id,
      title: targetLabel(pedido),
      subtitle: RESOURCE_LABELS[pedido.tipo_recurso] ?? pedido.tipo_recurso,
    }
  }

  const alocacaoTargets: Array<[string, string, string]> = [
    ['maquina_id', '/maquinas', firstString(next.maquina_label, previous.maquina_label)],
    ['notebook_id', '/notebooks', firstString(next.notebook_label, previous.notebook_label)],
    ['aparelho_id', '/aparelhos', firstString(next.aparelho_label, previous.aparelho_label)],
    ['ramal_id', '/ramais', firstString(next.ramal_label, previous.ramal_label)],
  ]

  for (const [key, path, label] of alocacaoTargets) {
    const id = firstString(next[key], previous[key])
    if (id) {
      return {
        path,
        id,
        title: label || formatValue(id, key, next || previous),
        subtitle: RESOURCE_LABELS[pedido.tipo_recurso] ?? 'Alocação',
      }
    }
  }

  const colaboradorId = firstString(next.colaborador_id, previous.colaborador_id)
  if (colaboradorId) {
    return {
      path: '/colaboradores',
      id: colaboradorId,
      title: firstString(next.colaborador_nome, previous.colaborador_nome) || 'Colaborador',
      subtitle: RESOURCE_LABELS[pedido.tipo_recurso] ?? 'Alocação',
    }
  }

  if (pedido.tipo_recurso === 'forum_arquivos') {
    const pastaId = firstString(next.pasta_id, previous.pasta_id)
    if (pastaId) {
      const pastaNome = firstString(next.pasta_nome, previous.pasta_nome) || 'Documentos'
      const params = new URLSearchParams()
      params.set('pasta', pastaId)
      return {
        path: '/forum/documentos',
        id: pastaId,
        title: pastaNome,
        subtitle: 'Documentos do Fórum',
        href: buildHref('/forum/documentos', params),
      }
    }
  }

  return null
}

function buildContextRows(pedido: Pedido) {
  return [
    ['Categoria', KIND_META[pedidoKind(pedido)].label],
    ['Recurso', targetLabel(pedido)],
    ['Ação', ACTION_LABELS[pedido.acao] ?? pedido.acao],
  ]
    .filter(([, value]) => value && value !== '—')
    .map(([label, value]) => ({ label, value }))
}

function notifyPedidoToast(title: string, detail: string, color = '#3b82f6') {
  toast.custom((id) => (
    <div className="flex w-80 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-xl shadow-slate-950/40">
      <span className="w-1.5 shrink-0" style={{ backgroundColor: color }} />
      <div className="min-w-0 flex-1 px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-100">{title}</p>
            <p className="mt-0.5 text-xs text-slate-400">{detail}</p>
          </div>
          <button
            type="button"
            onClick={() => toast.dismiss(id)}
            className="rounded-md px-1.5 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
            aria-label="Fechar notificação"
          >
            x
          </button>
        </div>
      </div>
    </div>
  ), { id: 'pedidos-feedback' })
}

export default function PedidosPage() {
  const { perfil, isLoading } = usePermission()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const reduceMotion = useReducedMotion()
  const inspectId = searchParams.get('inspect')
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<PedidoStatus | 'pendente' | 'aprovada' | 'recusada' | ''>('pendente')
  const [kindFilter, setKindFilter] = useState<PedidoKind | ''>('')
  const [actionFilter, setActionFilter] = useState('')
  const [selected, setSelected] = useState<Pedido | null>(null)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatDraft, setChatDraft] = useState('')

  const isAdmin = perfil === 'admin' || perfil === 'dev'
  const canAccess = Boolean(perfil)

  function openPedido(pedido: Pedido) {
    const href = buildInspectHref(pathname, searchParams.toString(), pedido.id)
    setSelected(pedido)
    writePendingInspectPreview(window.sessionStorage, href, {
      title: targetLabel(pedido),
      subtitle: `${ACTION_LABELS[pedido.acao] ?? pedido.acao} · ${STATUS_META[pedido.status].label}`,
    })
    router.push(href, { scroll: false })
  }

  function closePedido() {
    setSelected(null)
    setChatOpen(false)
    setChatDraft('')
    if (!searchParams.has('inspect')) return
    router.replace(removeInspectHref(pathname, searchParams.toString()), { scroll: false })
  }

  function openPedidoTarget(pedido: Pedido) {
    const target = getPedidoInspectTarget(pedido)
    if (!target) {
      notifyPedidoToast('Sem item vinculado', 'Este pedido ainda não aponta para um registro navegável.', '#f59e0b')
      return
    }

    if (target.href) {
      writePendingInspectPreview(window.sessionStorage, target.href, inferInspectPreview({
        id: target.id,
        nome: target.title,
        descricao: target.subtitle,
      }))
      router.push(target.href)
      return
    }

    const params = new URLSearchParams()
    params.set('inspect', target.id)
    const href = buildHref(target.path, params)
    writePendingInspectPreview(window.sessionStorage, href, inferInspectPreview({
      id: target.id,
      nome: target.title,
      descricao: target.subtitle,
    }))
    router.push(href)
  }

  async function sendComment(pedido: Pedido) {
    const comentario = chatDraft.trim()
    if (!comentario) return
    setReviewingId(pedido.id)
    try {
      const res = await fetch(`/api/solicitacoes-inventario/${pedido.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisao: 'comentar', comentario }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Erro ao enviar comentário')
      setPedidos(current => current.map(item => item.id === pedido.id ? json : item))
      setSelected(json)
      setChatDraft('')
      notifyPedidoToast('Comentário enviado', 'A conversa da solicitação foi atualizada.', '#3b82f6')
    } catch (error: any) {
      notifyPedidoToast('Erro no comentário', error.message ?? 'Não foi possível enviar a mensagem.', '#f43f5e')
    } finally {
      setReviewingId(null)
    }
  }

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/solicitacoes-inventario?limit=500')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Erro ao carregar pedidos')
      setPedidos(json.data ?? [])
    } catch (error: any) {
      notifyPedidoToast('Erro ao carregar pedidos', error.message ?? 'Não foi possível atualizar a fila.', '#f43f5e')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!canAccess) return
    load()
  }, [canAccess])

  useEffect(() => {
    if (!isAdmin) setStatusFilter('')
  }, [isAdmin])

  useEffect(() => {
    if (!inspectId) {
      setSelected(null)
      return
    }

    const match = pedidos.find(pedido => pedido.id === inspectId)
    if (match) setSelected(match)
  }, [inspectId, pedidos])

  const filtered = useMemo(() => {
    return pedidos.filter(pedido => {
      if (statusFilter && pedido.status !== statusFilter) return false
      if (kindFilter && pedidoKind(pedido) !== kindFilter) return false
      if (actionFilter && pedido.acao !== actionFilter) return false
      return true
    })
  }, [pedidos, statusFilter, kindFilter, actionFilter])

  const overview = useMemo(() => {
    const overviewItems = statusFilter || kindFilter || actionFilter ? filtered : pedidos
    const byStatus = {
      pendente: overviewItems.filter(pedido => pedido.status === 'pendente').length,
      aprovada: overviewItems.filter(pedido => pedido.status === 'aprovada').length,
      recusada: overviewItems.filter(pedido => pedido.status === 'recusada').length,
    }
    const byKind = {
      inventario: overviewItems.filter(pedido => pedidoKind(pedido) === 'inventario').length,
      upload: overviewItems.filter(pedido => pedidoKind(pedido) === 'upload').length,
    }
    const byAction = Object.keys(ACTION_LABELS).map(action => ({
      action,
      label: ACTION_LABELS[action],
      count: overviewItems.filter(pedido => pedido.acao === action).length,
    }))

    return { byStatus, byKind, byAction }
  }, [pedidos, filtered, statusFilter, kindFilter, actionFilter])
  const pedidoOverviewFilters = [
    statusFilter ? { kind: 'status', value: statusFilter, label: STATUS_META[statusFilter].label } : null,
    kindFilter ? { kind: 'tipo', value: kindFilter, label: KIND_META[kindFilter].label } : null,
    actionFilter ? { kind: 'acao', value: actionFilter, label: ACTION_LABELS[actionFilter] ?? actionFilter } : null,
  ].filter((filter): filter is { kind: string; value: string; label: string } => Boolean(filter))
  const overviewExportConfig: OverviewExportConfig<Pedido> = {
    title: 'Overview de Pedidos',
    filename: 'overview-pedidos',
    rows: filtered,
    activeFilters: pedidoOverviewFilters,
    columns: [
      { key: 'created_at', header: 'Criado em', value: pedido => pedido.created_at ? new Date(pedido.created_at).toLocaleString('pt-BR') : null },
      { key: 'tipo', header: 'Tipo', value: pedido => KIND_META[pedidoKind(pedido)].label },
      { key: 'acao', header: 'Ação', value: pedido => ACTION_LABELS[pedido.acao] ?? pedido.acao },
      { key: 'status', header: 'Status', value: pedido => STATUS_META[pedido.status].label },
      { key: 'recurso', header: 'Recurso', value: pedido => RESOURCE_LABELS[pedido.tipo_recurso] ?? pedido.tipo_recurso },
      { key: 'solicitante', header: 'Solicitante', value: pedido => pedido.solicitante_nome },
      { key: 'revisor', header: 'Revisor', value: pedido => pedido.revisor_nome },
      { key: 'revisado_em', header: 'Revisado em', value: pedido => pedido.revisado_em ? new Date(pedido.revisado_em).toLocaleString('pt-BR') : null },
      { key: 'parecer', header: 'Parecer', value: pedido => pedido.parecer },
      { key: 'erro', header: 'Erro de aplicação', value: pedido => pedido.erro_aplicacao },
    ],
  }
  const selectedContextRows = selected ? buildContextRows(selected) : []
  const selectedTarget = selected ? getPedidoInspectTarget(selected) : null
  const selectedArquivo = selected ? getPedidoArquivoInfo(selected) : null

  async function review(pedido: Pedido, decisao: 'aprovar' | 'recusar') {
    setReviewingId(pedido.id)
    try {
      const res = await fetch(`/api/solicitacoes-inventario/${pedido.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisao, comentario: chatDraft }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Erro ao revisar pedido')
      notifyPedidoToast(
        decisao === 'aprovar' ? 'Pedido aprovado' : 'Pedido recusado',
        decisao === 'aprovar' ? 'A solicitação foi aplicada e auditada.' : 'A solicitação foi encerrada sem alteração.',
        decisao === 'aprovar' ? '#10b981' : '#f43f5e',
      )
      closePedido()
      setChatDraft('')
      await load()
    } catch (error: any) {
      notifyPedidoToast('Erro ao revisar pedido', error.message ?? 'Não foi possível concluir a revisão.', '#f43f5e')
      await load()
    } finally {
      setReviewingId(null)
    }
  }

  if (isLoading) return null

  if (!canAccess) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-white">Pedidos</h1>
        <p className="mt-2 text-slate-400">Entre na plataforma para acompanhar solicitações.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 text-slate-100 md:p-5">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-white">{isAdmin ? 'Pedidos' : 'Meus pedidos'}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {isAdmin
            ? 'Solicitações aguardando revisão administrativa'
            : 'Acompanhe as solicitações que você enviou para aprovação'}
        </p>
        <p className="mt-1 text-sm text-slate-500">{filtered.length} registro(s)</p>
      </div>

      <section className="mb-4 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Overview</p>
            <h2 className="text-base font-semibold text-white">Fila de pedidos</h2>
          </div>
          <div className="flex items-center gap-2">
          <OverviewExportMenu config={overviewExportConfig} />
          {(statusFilter || kindFilter || actionFilter) && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter('')
                setKindFilter('')
                setActionFilter('')
                notifyPedidoToast('Pedidos em visão geral', 'Todos os filtros voltaram a aparecer.', '#3b82f6')
              }}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              Limpar seleção
            </button>
          )}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,0.65fr)_minmax(0,1.35fr)]">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {(Object.keys(KIND_META) as PedidoKind[]).map(kind => {
              const meta = KIND_META[kind]
              const Icon = meta.icon
              const active = kindFilter === kind
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => {
                    setKindFilter(active ? '' : kind)
                    notifyPedidoToast(
                      active ? 'Filtro removido' : meta.label,
                      active ? 'Todos os tipos de pedido voltaram a aparecer.' : meta.description,
                      kind === 'upload' ? '#06b6d4' : '#3b82f6',
                    )
                  }}
                  className={cn(
                    'flex min-h-16 items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition',
                    active ? meta.tone : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
                      active ? 'border-current/30 bg-white/5' : 'border-slate-800 bg-slate-900 text-slate-400',
                    )}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="truncate text-sm font-semibold">{meta.label}</span>
                  </div>
                  <span className="shrink-0 text-2xl font-bold text-white">{overview.byKind[kind]}</span>
                </button>
              )
            })}
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
            {(Object.keys(STATUS_META) as PedidoStatus[]).map(status => {
              const meta = STATUS_META[status]
              const Icon = meta.icon
              const active = statusFilter === status
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    setStatusFilter(active ? '' : status)
                    notifyPedidoToast(
                      active ? 'Filtro removido' : meta.label,
                      active ? 'Todos os status voltaram a aparecer.' : `Mostrando somente pedidos ${meta.label.toLowerCase()}.`,
                      status === 'pendente' ? '#f59e0b' : status === 'aprovada' ? '#10b981' : '#f43f5e',
                    )
                  }}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-lg border p-2.5 text-left transition',
                    active ? meta.tone : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon className="h-3.5 w-3.5" />
                    <p className="truncate text-xs font-semibold">{meta.label}</p>
                  </div>
                  <span className="text-lg font-bold text-white">{overview.byStatus[status]}</span>
                </button>
              )
            })}
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              <GitPullRequest className="h-3.5 w-3.5" />
              Ações solicitadas
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {overview.byAction.map(item => {
                const active = actionFilter === item.action
                return (
                  <button
                    key={item.action}
                    type="button"
                    onClick={() => {
                      setActionFilter(active ? '' : item.action)
                      notifyPedidoToast(
                        active ? 'Filtro removido' : item.label,
                        active ? 'Todas as ações voltaram a aparecer.' : `Mostrando pedidos de ${item.label.toLowerCase()}.`,
                        '#3b82f6',
                      )
                    }}
                    className={cn(
                      'rounded-md border p-2.5 text-left transition',
                      active
                        ? 'border-blue-500 bg-blue-500/10 text-blue-100'
                        : 'border-transparent bg-slate-900 text-slate-300 hover:border-slate-700',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold">{item.label}</span>
                      <span className="text-base font-bold text-white">{item.count}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">pedidos</p>
                  </button>
                )
              })}
            </div>
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando pedidos...
        </div>
      ) : (
        <motion.div
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          initial={reduceMotion ? false : 'hidden'}
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.035 } } }}
        >
          {filtered.map(pedido => {
              const rows = diffRows(pedido)
              const isPending = pedido.status === 'pendente'
              const reviewing = reviewingId === pedido.id

              return (
                <motion.article
                  key={pedido.id}
                  variants={{
                    hidden: { opacity: 0, y: 8 },
                    show: { opacity: 1, y: 0 },
                  }}
                  exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="flex min-h-56 flex-col rounded-xl border border-slate-800 bg-slate-900/75 p-3 transition hover:border-blue-500/70"
                >
                  <button type="button" onClick={() => openPedido(pedido)} className="flex-1 text-left">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-300">
                          {ACTION_LABELS[pedido.acao] ?? pedido.acao}
                        </p>
                        <h2 className="mt-1.5 truncate text-base font-bold text-white">{targetLabel(pedido)}</h2>
                        <p className="mt-0.5 text-xs text-slate-400">{RESOURCE_LABELS[pedido.tipo_recurso] ?? pedido.tipo_recurso}</p>
                      </div>
                      <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', STATUS_META[pedido.status].tone)}>
                        {STATUS_META[pedido.status].label.replace(/s$/, '')}
                      </span>
                    </div>

                    <div className="mb-3 rounded-lg border border-slate-800 bg-slate-950/70 p-2.5">
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Mudança proposta</p>
                      <p className="line-clamp-2 text-xs font-medium leading-5 text-slate-200">{requestSummary(pedido)}</p>
                      {rows.length > 2 && <p className="mt-2 text-xs text-slate-500">+{rows.length - 2} campo(s) no detalhe</p>}
                    </div>

                    <div className="grid gap-1 text-xs text-slate-400">
                      <p>Solicitado por <span className="font-semibold text-slate-200">{pedido.solicitante_nome ?? 'Usuário'}</span></p>
                      <p>{formatDate(pedido.created_at)}</p>
                      {pedido.revisor_nome && (
                        <p>Revisado por <span className="font-semibold text-slate-200">{pedido.revisor_nome}</span></p>
                      )}
                    </div>
                  </button>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => openPedido(pedido)}
                      className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
                    >
                      Ver detalhe
                    </button>
                    {isAdmin && isPending ? (
                      <button
                        type="button"
                        onClick={() => review(pedido, 'aprovar')}
                        disabled={reviewing}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
                      >
                        {reviewing ? 'Aplicando...' : 'Aprovar'}
                      </button>
                    ) : (
                      <div className="rounded-lg border border-slate-800 px-3 py-2 text-center text-xs font-semibold text-slate-400">
                        {isPending ? 'Aguardando' : STATUS_META[pedido.status].label}
                      </div>
                    )}
                  </div>
                </motion.article>
              )
            })}
        </motion.div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-slate-400">
          Nenhum pedido encontrado com os filtros atuais.
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <AnimatedSheetFrame key={selected.id} onClose={closePedido} className="max-w-xl">
            <div className="border-b border-slate-800 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">Revisão de pedido</p>
                  <h2 className="mt-1.5 text-xl font-bold text-white">{targetLabel(selected)}</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    {ACTION_LABELS[selected.acao] ?? selected.acao} em {RESOURCE_LABELS[selected.tipo_recurso] ?? selected.tipo_recurso}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setChatOpen(value => !value)}
                    className={cn(
                      'relative flex h-9 w-9 items-center justify-center rounded-full border transition',
                      chatOpen
                        ? 'border-blue-500 bg-blue-500/15 text-blue-200'
                        : 'border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white',
                    )}
                    aria-label="Abrir comentários do pedido"
                    title="Comentários"
                  >
                    <MessageCircle className="h-4 w-4" />
                    {(selected.comentarios?.length ?? 0) > 0 && (
                      <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-blue-500 px-1 text-[10px] font-bold text-white">
                        {selected.comentarios!.length}
                      </span>
                    )}
                  </button>
                  <button type="button" onClick={closePedido} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Solicitante</p>
                  <p className="mt-1 truncate text-sm font-semibold text-white">{selected.solicitante_nome ?? 'Usuário'}</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Status</p>
                  <p className="mt-1 text-sm font-semibold text-white">{STATUS_META[selected.status].label}</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Data</p>
                  <p className="mt-1 text-sm font-semibold text-white">{formatDate(selected.created_at)}</p>
                </div>
              </div>

              {selected.erro_aplicacao && (
                <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                  <div className="mb-1 flex items-center gap-2 font-semibold">
                    <ShieldAlert className="h-4 w-4" />
                    Conflito ao aplicar
                  </div>
                  {selected.erro_aplicacao}
                </div>
              )}

              <section className="mb-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Contexto do pedido</p>
                    <p className="mt-1 text-sm font-semibold text-white">{targetLabel(selected)}</p>
                  </div>
                  {selectedTarget && (
                    <button
                      type="button"
                      onClick={() => openPedidoTarget(selected)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/40 px-2.5 py-1.5 text-xs font-semibold text-blue-200 transition hover:bg-blue-500/10"
                    >
                      Abrir
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {selectedContextRows.map(row => (
                    <div key={row.label} className="min-w-0 rounded-md bg-slate-900/80 px-2.5 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{row.label}</p>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-200">{row.value}</p>
                    </div>
                  ))}
                </div>
              </section>

              {selectedArquivo && (
                <section className="mb-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Arquivo para verificação</p>
                      <p className="mt-1 text-xs text-slate-400">Confira o anexo antes de aprovar o pedido.</p>
                    </div>
                    <a
                      href={selectedArquivo.href}
                      download={selectedArquivo.nome}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/40 px-2.5 py-1.5 text-xs font-semibold text-blue-200 transition hover:bg-blue-500/10"
                    >
                      Baixar
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </div>
                  <div className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/75 p-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-blue-300">
                      {renderPedidoArquivoIcon(selectedArquivo.tipo)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{selectedArquivo.nome}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {[selectedArquivo.tipo, selectedArquivo.tamanho].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                </section>
              )}

              <AnimatePresence initial={false}>
                {chatOpen && (
                  <motion.section
                    initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16 }}
                    className="mb-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Comentários</p>
                        <p className="mt-1 text-xs text-slate-400">Conversa vinculada a esta solicitação.</p>
                      </div>
                    </div>
                    <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                      {(selected.comentarios ?? []).length === 0 && (
                        <p className="rounded-md border border-dashed border-slate-800 p-3 text-xs text-slate-500">
                          Nenhum comentário ainda.
                        </p>
                      )}
                      {(selected.comentarios ?? []).map((comentario, index) => (
                        <div
                          key={comentario.id ?? index}
                          className={cn(
                            'rounded-lg border p-2.5',
                            comentario.papel === 'revisor'
                              ? 'border-blue-500/20 bg-blue-500/10'
                              : 'border-slate-800 bg-slate-900/70',
                          )}
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <p className="truncate text-xs font-semibold text-slate-200">
                              {comentario.autor_nome ?? 'Usuário'}
                            </p>
                            <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-slate-500">
                              {comentario.papel === 'revisor' ? 'Aprovador' : 'Solicitante'}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap text-xs leading-5 text-slate-300">{comentario.conteudo}</p>
                          {comentario.created_at && (
                            <p className="mt-1 text-[10px] text-slate-500">{formatDate(comentario.created_at)}</p>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        value={chatDraft}
                        onChange={event => setChatDraft(event.target.value)}
                        placeholder="Adicionar comentário..."
                        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white outline-none transition placeholder:text-slate-500 focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => sendComment(selected)}
                        disabled={!chatDraft.trim() || reviewingId === selected.id}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-500 disabled:opacity-50"
                        aria-label="Enviar comentário"
                      >
                        {reviewingId === selected.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </button>
                    </div>
                  </motion.section>
                )}
              </AnimatePresence>

              <div className="space-y-3">
                {diffRows(selected).map(row => {
                  const previous = selected.dados_anteriores ?? {}
                  const next = selected.dados_propostos ?? {}
                  return (
                    <div key={row.key} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                      <p className="mb-2 text-sm font-semibold text-white">{row.label}</p>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="rounded-md bg-rose-500/10 p-2.5 text-sm text-rose-100">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-300">Antes</p>
                          <p className="break-words text-sm font-semibold">{formatValue(row.before, row.key, previous)}</p>
                        </div>
                        <div className="rounded-md bg-emerald-500/10 p-2.5 text-sm text-emerald-100">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-300">Proposto</p>
                          <p className="break-words text-sm font-semibold">{formatValue(row.after, row.key, next)}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {diffRows(selected).length === 0 && (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
                    <FileText className="mb-2 h-5 w-5" />
                    Nenhuma diferença estruturada detectada.
                  </div>
                )}
              </div>

              {(selected.revisor_nome || selected.revisado_em) && (
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Revisão</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {selected.revisor_nome ? `Revisado por ${selected.revisor_nome}` : 'Sem revisor'} · {formatDate(selected.revisado_em)}
                  </p>
                </div>
              )}
            </div>

            {isAdmin && selected.status === 'pendente' && (
              <div className="border-t border-slate-800 p-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => review(selected, 'recusar')}
                    disabled={Boolean(reviewingId)}
                    className="flex items-center justify-center gap-2 rounded-lg border border-rose-500/50 px-4 py-2.5 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/10 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                    Recusar
                  </button>
                  <button
                    type="button"
                    onClick={() => review(selected, 'aprovar')}
                    disabled={Boolean(reviewingId)}
                    className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                  >
                    {reviewingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Aprovar
                  </button>
                </div>
              </div>
            )}
          </AnimatedSheetFrame>
        )}
      </AnimatePresence>
    </div>
  )
}
