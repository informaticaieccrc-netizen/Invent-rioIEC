'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  FileSpreadsheet,
  Inbox,
  Laptop,
  Loader2,
  MonitorCheck,
  Rows3,
  ShieldAlert,
  SquareCode,
  Upload,
  UserPlus,
  Wrench,
  X,
} from 'lucide-react'
import { DataTable } from '@/components/tables/data-table'
import { OverviewExportMenu, type OverviewExportConfig } from '@/components/tables/overview-export-menu'
import { PageHeader } from '@/components/layout/page-header'
import { cn } from '@/lib/utils'
import { pushInspectHistory, writePendingInspectPreview } from '@/lib/navigation-context'
import { usePermission } from '@/hooks/use-permission'

type SnowSolicitacao = {
  id: string
  nome_arquivo: string
  tipo_arquivo: string
  assunto_email: string | null
  origem_email: string | null
  recebido_em: string | null
  total_recebido: number
  total_atendidas: number
  total_nao_atendidas: number
  total_quarentena: number
  total_inconsistentes: number
  status_processamento: string
  erro_processamento: string | null
  criado_em: string | null
  planner_pendentes?: number
  planner_em_atendimento?: number
  planner_concluidas?: number
  planner_abertas?: number
  planner_resolvida?: boolean
  total_operacional?: number
  total_inconsistentes_abertas?: number
}

type SnowItem = {
  id: string
  ip: string | null
  hostname: string | null
  tipo_arquivo: string
  status: string
  motivo: string | null
  maquina_id: string | null
  colaborador_alocado: string | null
  setor_alocado: string | null
  localidade_alocada: string | null
  ultima_revisao: string | null
  data_ultima_solicitacao: string | null
  bloqueado_ate: string | null
  planner_status?: string | null
  planner_task_id?: string | null
  csc_numero?: string | null
  csc_criado_em?: string | null
  csc_atualizado_em?: string | null
  atendente_nome?: string | null
  atendente_codigo_pessoa?: string | null
  assumido_em?: string | null
  concluido_em?: string | null
  conclusao_observacao?: string | null
  criado_em?: string | null
  maquina?: {
    id: string
    nome_host: string | null
    endereco_ip: string | null
    identificador: string | null
  } | null
  solicitacao_snow?: {
    id: string
    nome_arquivo: string
    tipo_arquivo: string
    origem_email: string | null
    recebido_em: string | null
    criado_em: string | null
  }
  repeticoes?: Array<{
    id: string
    status: string
    motivo: string | null
    criado_em: string | null
    bloqueado_ate: string | null
    solicitacao_snow?: {
      id: string
      nome_arquivo: string
      tipo_arquivo: string
      origem_email: string | null
      recebido_em: string | null
      criado_em: string | null
    }
  }>
}

type SnowDetalhe = SnowSolicitacao & { itens: SnowItem[] }

type DevUsuario = {
  id: string
  nome: string
  codigo_pessoa: string | null
  email: string
  perfil: string
  ativo: boolean
}

type Overview = {
  total_solicitacoes: number
  total_itens: number
  atendidas: number
  encontradas?: number
  nao_atendidas: number
  em_quarentena: number
  inconsistentes: number
  planner_pendentes?: number
  planner_em_atendimento?: number
  planner_resolvidas?: number
}

type DateScope = 'hoje' | '7d' | '30d' | 'tudo'
type ViewMode = 'solicitacoes' | 'maquinas'
type MachineFilter = 'pendentes' | 'em_atendimento' | 'resolvidas' | 'quarentena' | 'inconsistentes'

const TIPO_LABELS: Record<string, string> = {
  ativos_nao_inventariados: 'Ativos não inventariados',
  computadores_fora_organizacao: 'Fora da organização',
  computadores_a_serem_arquivados: 'A serem arquivados',
}

const STATUS_LABELS: Record<string, string> = {
  processado: 'Processado',
  erro_processamento: 'Erro',
  atendida: 'Encontrada',
  nao_atendida: 'Fora do inventário',
  em_quarentena: 'Quarentena',
  inconsistente: 'Inconsistente',
  pendente: 'Pendente',
  assumido: 'Assumido',
  concluido: 'Concluído',
}

const STATUS_TONES: Record<string, string> = {
  processado: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200',
  erro_processamento: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200',
  atendida: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200',
  nao_atendida: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  em_quarentena: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200',
  inconsistente: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200',
  pendente: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  assumido: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200',
  concluido: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200',
}

const DATE_SCOPES: Array<{ value: DateScope; label: string }> = [
  { value: 'hoje', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'tudo', label: 'Tudo' },
]

const SNOW_MACHINE_ALERT_KEY = 'crc:snow-machine-alert'

function totalEncontradasSolicitacao(item: SnowSolicitacao) {
  return item.total_operacional ?? (item.total_atendidas + item.total_inconsistentes)
}

function formatLocalDateParam(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateRangeForScope(scope: DateScope): { inicio?: string; fim?: string } {
  if (scope === 'tudo') return {}
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  if (scope === 'hoje') {
    start.setHours(0, 0, 0, 0)
  } else {
    start.setDate(start.getDate() - (scope === '7d' ? 6 : 29))
  }
  return {
    inicio: formatLocalDateParam(start),
    fim: formatLocalDateParam(now),
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('pt-BR').format(date)
}

function quarantineDaysLeft(value: string | null | undefined) {
  if (!value) return null
  const end = new Date(value)
  if (Number.isNaN(end.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const endDay = new Date(end)
  endDay.setHours(0, 0, 0, 0)
  return Math.max(0, Math.ceil((endDay.getTime() - today.getTime()) / 86_400_000))
}

function quarantineCountdownText(value: string | null | undefined) {
  const days = quarantineDaysLeft(value)
  if (days === null) return 'Sem prazo definido'
  if (days === 0) return 'Sai hoje da quarentena'
  if (days === 1) return 'Falta 1 dia'
  return `Faltam ${days} dias`
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap', STATUS_TONES[status] ?? STATUS_TONES.nao_atendida)}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function OperationalStatusIcon({ item }: { item: Pick<SnowItem, 'status' | 'planner_status'> }) {
  if (item.status === 'em_quarentena') return <ShieldAlert className="h-5 w-5 text-amber-300" />
  if (item.status === 'nao_atendida') return <Circle className="h-5 w-5 text-slate-500" />
  if ((item.planner_status ?? 'pendente') === 'concluido') return <MonitorCheck className="h-5 w-5 text-emerald-400" />
  if ((item.planner_status ?? 'pendente') === 'assumido') return <Laptop className="h-5 w-5 text-cyan-400" />
  return <Clock3 className="h-5 w-5 text-blue-400" />
}

function operationalStatusLabel(item: Pick<SnowItem, 'status' | 'planner_status'>) {
  if (item.status === 'em_quarentena') return 'Quarentena'
  if (item.status === 'nao_atendida') return 'Fora do inventário'
  return STATUS_LABELS[item.planner_status || 'pendente'] ?? 'Pendente'
}

function isOriginInconsistent(item: Pick<SnowItem, 'status'>) {
  return item.status === 'inconsistente'
}

function isOperationalItem(item: Pick<SnowItem, 'status'>) {
  return item.status === 'atendida' || item.status === 'inconsistente'
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
  description,
  active,
  onClick,
}: {
  label: string
  value: number
  icon: typeof Inbox
  tone: string
  description?: string
  active?: boolean
  onClick?: () => void
}) {
  const content = (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-bold leading-none text-slate-900 dark:text-white">{value.toLocaleString('pt-BR')}</p>
          {description && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{description}</p>}
        </div>
        <span className={cn('shrink-0 rounded-lg p-2', tone)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
  )
  const className = cn(
    'min-w-0 rounded-lg border border-slate-100 bg-white px-4 py-3 text-left transition dark:border-slate-800 dark:bg-slate-900',
    onClick && 'hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-950/10 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:border-blue-500/60',
    active && 'border-blue-400 bg-blue-50/70 ring-1 ring-blue-400/50 dark:border-blue-500 dark:bg-blue-500/10'
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    )
  }

  return <div className={className}>{content}</div>
}

function machineTitle(item: SnowItem) {
  return item.maquina?.nome_host || item.hostname || item.maquina?.endereco_ip || item.ip || 'Máquina SNOW'
}

function machineFilterLabel(filter: MachineFilter) {
  if (filter === 'pendentes') return 'pendentes'
  if (filter === 'em_atendimento') return 'em atendimento'
  if (filter === 'resolvidas') return 'resolvidas'
  if (filter === 'quarentena') return 'em quarentena'
  if (filter === 'inconsistentes') return 'inconsistentes'
  return 'pendentes'
}

export default function SnowPage() {
  const { isAdmin, perfil } = usePermission()
  const showSnowDevTools = perfil === 'dev'
  const router = useRouter()
  const searchParams = useSearchParams()
  const reduceMotion = useReducedMotion()
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get('page') || 1)))
  const [machinePage, setMachinePage] = useState(() => Math.max(1, Number(searchParams.get('page') || 1)))
  const [viewMode, setViewMode] = useState<ViewMode>(() => searchParams.get('view') === 'maquinas' ? 'maquinas' : 'solicitacoes')
  const [machineFilter, setMachineFilter] = useState<MachineFilter>(() => {
    const filter = searchParams.get('filter')
    return filter === 'pendentes' || filter === 'em_atendimento' || filter === 'resolvidas' || filter === 'quarentena' || filter === 'inconsistentes' ? filter : 'pendentes'
  })
  const [navigatingItemId, setNavigatingItemId] = useState<string | null>(null)
  const [dateScope, setDateScope] = useState<DateScope>(() => {
    const scope = searchParams.get('scope')
    return scope === 'hoje' || scope === '7d' || scope === '30d' || scope === 'tudo' ? scope : '30d'
  })
  const [data, setData] = useState<SnowSolicitacao[]>([])
  const [machineItems, setMachineItems] = useState<SnowItem[]>([])
  const [exportSolicitacoes, setExportSolicitacoes] = useState<SnowSolicitacao[]>([])
  const [exportMachineItems, setExportMachineItems] = useState<SnowItem[]>([])
  const [total, setTotal] = useState(0)
  const [machineTotal, setMachineTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [machineTotalPages, setMachineTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [machineLoading, setMachineLoading] = useState(true)
  const [overview, setOverview] = useState<Overview>({
    total_solicitacoes: 0,
    total_itens: 0,
    atendidas: 0,
    nao_atendidas: 0,
    em_quarentena: 0,
    inconsistentes: 0,
    planner_pendentes: 0,
    planner_em_atendimento: 0,
    planner_resolvidas: 0,
  })
  const [selected, setSelected] = useState<SnowDetalhe | null>(null)
  const [operationalInspect, setOperationalInspect] = useState<SnowItem | null>(null)
  const [quarantineInspect, setQuarantineInspect] = useState<SnowItem | null>(null)
  const [inconsistentInspect, setInconsistentInspect] = useState<SnowItem | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [devUsuarios, setDevUsuarios] = useState<DevUsuario[]>([])
  const [devUsuarioId, setDevUsuarioId] = useState('')
  const [devXlsxFile, setDevXlsxFile] = useState<File | null>(null)
  const [devOrigemEmail, setDevOrigemEmail] = useState('smcgti.snow@pucminas.br')
  const [devAssuntoEmail, setDevAssuntoEmail] = useState('')
  const [devProcessing, setDevProcessing] = useState(false)
  const [devCompleting, setDevCompleting] = useState<string | null>(null)
  const [devAssigning, setDevAssigning] = useState<string | null>(null)
  const [devPanelOpen, setDevPanelOpen] = useState(true)
  const closingInspectRef = useRef(false)

  const dateRange = useMemo(() => dateRangeForScope(dateScope), [dateScope])
  const machineFilterQuery = useMemo<{ status: string; planner_status?: string }>(() => {
    if (machineFilter === 'pendentes') return { status: 'atendida,inconsistente', planner_status: 'pendente' }
    if (machineFilter === 'em_atendimento') return { status: 'atendida,inconsistente', planner_status: 'assumido' }
    if (machineFilter === 'resolvidas') return { status: 'atendida,inconsistente', planner_status: 'concluido' }
    if (machineFilter === 'quarentena') return { status: 'em_quarentena' }
    if (machineFilter === 'inconsistentes') return { status: 'inconsistente', planner_status: 'pendente,assumido' }
    return { status: 'atendida,inconsistente', planner_status: 'pendente' }
  }, [machineFilter])

  const snowReturnHref = useMemo(() => {
    const params = new URLSearchParams()
    params.set('view', viewMode)
    params.set('scope', dateScope)
    params.set('page', String(viewMode === 'maquinas' ? machinePage : page))
    if (viewMode === 'maquinas') params.set('filter', machineFilter)
    return `/snow?${params}`
  }, [dateScope, machineFilter, machinePage, page, viewMode])

  useEffect(() => {
    const view = searchParams.get('view')
    const filter = searchParams.get('filter')
    const scope = searchParams.get('scope')
    const pageParam = Math.max(1, Number(searchParams.get('page') || 1))

    if (view === 'maquinas' || view === 'solicitacoes') setViewMode(view)
    if (filter === 'pendentes' || filter === 'em_atendimento' || filter === 'resolvidas' || filter === 'quarentena' || filter === 'inconsistentes') setMachineFilter(filter)
    if (scope === 'hoje' || scope === '7d' || scope === '30d' || scope === 'tudo') setDateScope(scope)
    if (view === 'maquinas') setMachinePage(pageParam)
    if (view === 'solicitacoes') setPage(pageParam)
  }, [searchParams])

  useEffect(() => {
    let cancelled = false
    async function loadOverview() {
      const params = new URLSearchParams()
      if (dateRange.inicio) params.set('inicio', dateRange.inicio)
      if (dateRange.fim) params.set('fim', dateRange.fim)
      const res = await fetch(`/api/snow/overview?${params}`)
      const json = await res.json().catch(() => null)
      if (!cancelled && json) setOverview(json)
    }
    loadOverview()
    return () => { cancelled = true }
  }, [dateRange, refreshKey])

  useEffect(() => {
    let cancelled = false
    async function loadData() {
      setLoading(true)
      try {
        const params = new URLSearchParams({ page: String(page), limit: '20' })
        if (dateRange.inicio) params.set('inicio', dateRange.inicio)
        if (dateRange.fim) params.set('fim', dateRange.fim)

        const res = await fetch(`/api/snow/solicitacoes?${params}`)
        const json = await res.json()
        if (!cancelled) {
          setData(json.data ?? [])
          setTotal(json.total ?? 0)
          setTotalPages(json.totalPages ?? 1)
        }
      } catch (error) {
        console.error('[snow page]', error)
        if (!cancelled) {
          setData([])
          setTotal(0)
          setTotalPages(1)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadData()
    return () => { cancelled = true }
  }, [page, dateRange, refreshKey])

  useEffect(() => {
    if (closingInspectRef.current) return
    const inspectId = searchParams.get('inspect')
    if (!inspectId || selected?.id === inspectId) return

    const row = data.find(item => item.id === inspectId)
    if (row) {
      openDetail(row)
      return
    }

    let cancelled = false
    async function loadInspect() {
      setDetailLoading(true)
      try {
        const res = await fetch(`/api/snow/solicitacoes/${inspectId}`)
        if (!res.ok) return
        const json = await res.json()
        if (!cancelled) setSelected(json)
      } catch (error) {
        console.error('[snow inspect query]', error)
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    }
    loadInspect()
    return () => { cancelled = true }
  }, [data, searchParams, selected?.id])

  useEffect(() => {
    let cancelled = false
    async function loadMachineItems() {
      setMachineLoading(true)
      try {
        const params = new URLSearchParams({ page: String(machinePage), limit: '18', status: machineFilterQuery.status })
        if (machineFilterQuery.planner_status) params.set('planner_status', machineFilterQuery.planner_status)
        if (dateRange.inicio) params.set('inicio', dateRange.inicio)
        if (dateRange.fim) params.set('fim', dateRange.fim)

        const res = await fetch(`/api/snow/itens?${params}`)
        const json = await res.json()
        if (!cancelled) {
          setMachineItems(json.data ?? [])
          setMachineTotal(json.total ?? 0)
          setMachineTotalPages(json.totalPages ?? 1)
        }
      } catch (error) {
        console.error('[snow machines]', error)
        if (!cancelled) {
          setMachineItems([])
          setMachineTotal(0)
          setMachineTotalPages(1)
        }
      } finally {
        if (!cancelled) setMachineLoading(false)
      }
    }
    loadMachineItems()
    return () => { cancelled = true }
  }, [machinePage, dateRange, machineFilterQuery, refreshKey])

  useEffect(() => {
    let cancelled = false
    async function loadExportRows() {
      try {
        if (viewMode === 'solicitacoes') {
          const params = new URLSearchParams({ page: '1', limit: '10000' })
          if (dateRange.inicio) params.set('inicio', dateRange.inicio)
          if (dateRange.fim) params.set('fim', dateRange.fim)
          const res = await fetch(`/api/snow/solicitacoes?${params}`)
          const json = await res.json()
          if (!cancelled) setExportSolicitacoes(json.data ?? [])
          return
        }

        const params = new URLSearchParams({ page: '1', limit: '10000', status: machineFilterQuery.status })
        if (machineFilterQuery.planner_status) params.set('planner_status', machineFilterQuery.planner_status)
        if (dateRange.inicio) params.set('inicio', dateRange.inicio)
        if (dateRange.fim) params.set('fim', dateRange.fim)
        const res = await fetch(`/api/snow/itens?${params}`)
        const json = await res.json()
        if (!cancelled) setExportMachineItems(json.data ?? [])
      } catch (error) {
        console.error('[snow export rows]', error)
        if (!cancelled) {
          if (viewMode === 'solicitacoes') setExportSolicitacoes(data)
          else setExportMachineItems(machineItems)
        }
      }
    }

    loadExportRows()
    return () => { cancelled = true }
  }, [data, dateRange, machineFilterQuery, machineItems, refreshKey, viewMode])

  useEffect(() => {
    if (!showSnowDevTools) return
    let cancelled = false
    async function loadUsuarios() {
      try {
        const res = await fetch('/api/admin/usuarios')
        const json = await res.json()
        if (!cancelled) {
          const usuarios = Array.isArray(json)
            ? json.filter((usuario: DevUsuario) => usuario.ativo)
            : []
          setDevUsuarios(usuarios)
          setDevUsuarioId(current => current || usuarios[0]?.id || '')
        }
      } catch (error) {
        console.error('[snow dev usuarios]', error)
      }
    }
    loadUsuarios()
    return () => { cancelled = true }
  }, [showSnowDevTools])

  useEffect(() => {
    const itemId = searchParams.get('item')
    if (viewMode !== 'maquinas' || machineFilter !== 'quarentena' || !itemId || quarantineInspect?.id === itemId) return
    const item = machineItems.find(candidate => candidate.id === itemId)
    if (item?.status === 'em_quarentena') openQuarantineInspect(item)
  }, [machineFilter, machineItems, quarantineInspect?.id, searchParams, viewMode])

  async function openDetail(row: SnowSolicitacao) {
    setDetailLoading(true)
    setSelected({ ...row, itens: [] })
    try {
      const res = await fetch(`/api/snow/solicitacoes/${row.id}`)
      const json = await res.json()
      setSelected(json)
    } catch (error) {
      console.error('[snow detail]', error)
    } finally {
      setDetailLoading(false)
    }
  }

  async function reloadSelected(solicitacaoId: string) {
    const res = await fetch(`/api/snow/solicitacoes/${solicitacaoId}`)
    if (!res.ok) return
    const json = await res.json()
    setSelected(json)
  }

  async function processDevXlsx() {
    if (!devXlsxFile) {
      toast.error('Selecione um arquivo .xlsx.')
      return
    }

    setDevProcessing(true)
    try {
      const formData = new FormData()
      formData.set('file', devXlsxFile)
      formData.set('origem_email', devOrigemEmail)
      if (devAssuntoEmail.trim()) formData.set('assunto_email', devAssuntoEmail.trim())

      const res = await fetch('/api/snow/dev/processar-xlsx', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Erro ao processar XLSX.')

      toast.success(`XLSX processado: ${(json?.itens?.length ?? json?.total_recebido ?? 0).toLocaleString('pt-BR')} registro(s).`)
      setDevXlsxFile(null)
      setDevAssuntoEmail('')
      setRefreshKey(key => key + 1)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao processar XLSX.')
    } finally {
      setDevProcessing(false)
    }
  }

  async function completeDevSnow(target: { itemId?: string; solicitacaoId?: string }) {
    if (!devUsuarioId) {
      toast.error('Selecione o usuário responsável.')
      return
    }

    const completingKey = target.itemId ? `item:${target.itemId}` : `solicitacao:${target.solicitacaoId}`
    setDevCompleting(completingKey)
    try {
      const res = await fetch('/api/snow/dev/concluir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: target.itemId,
          solicitacao_id: target.solicitacaoId,
          usuario_id: devUsuarioId,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Erro ao concluir chamada SNOW.')

      toast.success(`${(json.updated ?? 0).toLocaleString('pt-BR')} chamada(s) concluída(s).`)
      setRefreshKey(key => key + 1)

      if (target.itemId) {
        setOperationalInspect(current => current?.id === target.itemId
          ? {
              ...current,
              planner_status: 'concluido',
              atendente_nome: json.itens?.[0]?.atendente_nome ?? current.atendente_nome,
              atendente_codigo_pessoa: json.itens?.[0]?.atendente_codigo_pessoa ?? current.atendente_codigo_pessoa,
              concluido_em: json.itens?.[0]?.concluido_em ?? current.concluido_em,
            }
          : current)
        setInconsistentInspect(current => current?.id === target.itemId
          ? {
              ...current,
              planner_status: 'concluido',
              atendente_nome: json.itens?.[0]?.atendente_nome ?? current.atendente_nome,
              atendente_codigo_pessoa: json.itens?.[0]?.atendente_codigo_pessoa ?? current.atendente_codigo_pessoa,
              concluido_em: json.itens?.[0]?.concluido_em ?? current.concluido_em,
            }
          : current)
      }

      const selectedId = selected?.id
      if (selectedId) await reloadSelected(selectedId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao concluir chamada SNOW.')
    } finally {
      setDevCompleting(null)
    }
  }

  async function assignDevSnowItem(itemId: string) {
    if (!devUsuarioId) {
      toast.error('Selecione o usuário responsável.')
      return
    }

    setDevAssigning(itemId)
    try {
      const res = await fetch('/api/snow/dev/atribuir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: itemId,
          usuario_id: devUsuarioId,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Erro ao atribuir chamada SNOW.')

      toast.success(`Chamada atribuída para ${json.atendente_nome ?? 'usuário'}.`)
      setRefreshKey(key => key + 1)
      setOperationalInspect(current => current?.id === itemId
        ? {
            ...current,
            planner_status: json.planner_status ?? 'assumido',
            atendente_nome: json.atendente_nome ?? current.atendente_nome,
            atendente_codigo_pessoa: json.atendente_codigo_pessoa ?? current.atendente_codigo_pessoa,
            assumido_em: json.assumido_em ?? current.assumido_em,
          }
        : current)
      setInconsistentInspect(current => current?.id === itemId
        ? {
            ...current,
            planner_status: json.planner_status ?? 'assumido',
            atendente_nome: json.atendente_nome ?? current.atendente_nome,
            atendente_codigo_pessoa: json.atendente_codigo_pessoa ?? current.atendente_codigo_pessoa,
            assumido_em: json.assumido_em ?? current.assumido_em,
          }
        : current)

      const selectedId = selected?.id
      if (selectedId) await reloadSelected(selectedId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao atribuir chamada SNOW.')
    } finally {
      setDevAssigning(null)
    }
  }

  function closeDetail() {
    closingInspectRef.current = true
    setSelected(null)
    const params = new URLSearchParams(searchParams.toString())
    if (!params.has('inspect') && !params.has('item')) {
      window.setTimeout(() => { closingInspectRef.current = false }, 200)
      return
    }
    params.delete('inspect')
    params.delete('item')
    const query = params.toString()
    router.replace(query ? `/snow?${query}` : '/snow')
    window.setTimeout(() => { closingInspectRef.current = false }, 350)
  }

  function openSnowSolicitationFromInspect(solicitacaoId: string, itemId?: string | null) {
    closingInspectRef.current = false
    setQuarantineInspect(null)
    setInconsistentInspect(null)
    setSelected(null)
    const params = new URLSearchParams()
    params.set('view', 'solicitacoes')
    params.set('scope', dateScope)
    params.set('inspect', solicitacaoId)
    if (itemId) params.set('item', itemId)
    window.setTimeout(() => {
      router.push(`/snow?${params}`)
    }, reduceMotion ? 0 : 120)
  }

  function selectMachineFilter(filter: MachineFilter) {
    setMachineFilter(filter)
    setMachinePage(1)
    setViewMode('maquinas')
  }

  function openInconsistentInspect(item: SnowItem) {
    if (item.status !== 'inconsistente') return
    setOperationalInspect(null)
    setInconsistentInspect(item)
  }

  function openOperationalInspect(item: SnowItem) {
    if (!isOperationalItem(item)) return
    setQuarantineInspect(null)
    setInconsistentInspect(null)
    setOperationalInspect(item)
  }

  async function openQuarantineInspect(item: SnowItem) {
    if (item.status !== 'em_quarentena') return
    setOperationalInspect(null)
    setInconsistentInspect(null)
    setNavigatingItemId(item.id)
    try {
      const solicitacaoId = item.solicitacao_snow?.id
      if (!solicitacaoId) {
        setQuarantineInspect(item)
        return
      }
      const res = await fetch(`/api/snow/solicitacoes/${solicitacaoId}`)
      const json = await res.json()
      const detailed = json.itens?.find((candidate: SnowItem) => candidate.id === item.id)
      setQuarantineInspect(detailed ? { ...detailed, solicitacao_snow: detailed.solicitacao_snow ?? item.solicitacao_snow } : item)
    } catch (error) {
      console.error('[snow quarantine inspect]', error)
      setQuarantineInspect(item)
    } finally {
      setNavigatingItemId(null)
    }
  }

  function openMachineInspect(item: SnowItem) {
    if (!item.maquina_id || !['atendida', 'em_quarentena', 'inconsistente'].includes(item.status)) return
    const title = machineTitle(item)
    const hasOriginInconsistency = isOriginInconsistent(item)
    const subtitle = item.status === 'em_quarentena'
      ? 'Recorrência SNOW em menos de 15 dias'
      : hasOriginInconsistency
        ? `${operationalStatusLabel(item)} · Inconsistente por origem SNOW`
        : 'Encontrada pelo fluxo SNOW'
    const href = `/maquinas?inspect=${item.maquina_id}`
    setNavigatingItemId(item.id)
    if (typeof window !== 'undefined') {
      writePendingInspectPreview(window.sessionStorage, href, { title, subtitle })
      pushInspectHistory(window.sessionStorage, {
        path: '/snow',
        inspectId: item.id,
        type: 'snow',
        label: 'Snow',
        title: 'Snow',
        subtitle: item.solicitacao_snow?.nome_arquivo ?? selected?.nome_arquivo ?? 'Solicitações SNOW',
        href: snowReturnHref,
        timestamp: Date.now(),
      })
      window.sessionStorage.setItem(`${SNOW_MACHINE_ALERT_KEY}:${item.maquina_id}`, JSON.stringify({
        title,
        status: operationalStatusLabel(item),
        origin_inconsistent: hasOriginInconsistency,
        arquivo: item.solicitacao_snow?.nome_arquivo ?? selected?.nome_arquivo ?? null,
        recebido_em: item.solicitacao_snow?.recebido_em ?? item.solicitacao_snow?.criado_em ?? selected?.recebido_em ?? selected?.criado_em ?? null,
        bloqueado_ate: item.bloqueado_ate ?? null,
        planner_status: item.planner_status ?? 'pendente',
        solicitacao_id: item.solicitacao_snow?.id ?? selected?.id ?? null,
        item_id: item.id,
        snow_href: item.solicitacao_snow?.id ?? selected?.id
          ? `/snow?view=solicitacoes&scope=${dateScope}&inspect=${item.solicitacao_snow?.id ?? selected?.id}&item=${item.id}`
          : null,
        quarantine_href: item.status === 'em_quarentena'
          ? `/snow?view=maquinas&filter=quarentena&scope=${dateScope}&item=${item.id}`
          : null,
      }))
    }
    window.setTimeout(() => router.push(href), reduceMotion ? 0 : 140)
  }

  const columns = useMemo<ColumnDef<SnowSolicitacao, unknown>[]>(() => [
    {
      accessorKey: 'criado_em',
      header: 'Recebida',
      cell: ({ row }) => formatDateTime(row.original.recebido_em ?? row.original.criado_em),
    },
    {
      accessorKey: 'nome_arquivo',
      header: 'Arquivo',
      cell: ({ row }) => (
        <div className="max-w-[340px]">
          <p className="truncate font-medium text-slate-900 dark:text-white">{row.original.nome_arquivo}</p>
          <p className="truncate text-xs text-slate-500">{row.original.origem_email || '-'}</p>
        </div>
      ),
    },
    {
      accessorKey: 'tipo_arquivo',
      header: 'Tipo',
      cell: ({ row }) => TIPO_LABELS[row.original.tipo_arquivo] ?? row.original.tipo_arquivo,
    },
    {
      accessorKey: 'total_recebido',
      header: 'Recebidos',
      cell: ({ row }) => row.original.total_recebido.toLocaleString('pt-BR'),
    },
    {
      accessorKey: 'total_atendidas',
      header: 'Operacional',
      cell: ({ row }) => {
        const concluidas = row.original.planner_concluidas ?? 0
        const abertas = row.original.planner_abertas ?? ((row.original.planner_pendentes ?? 0) + (row.original.planner_em_atendimento ?? 0))
        const totalOperacional = totalEncontradasSolicitacao(row.original)
        const solicitacaoConcluida = totalOperacional > 0 && abertas === 0

        if (solicitacaoConcluida) {
          return (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
              <MonitorCheck className="h-3.5 w-3.5" />
              Solicitação concluída
            </span>
          )
        }

        return (
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
              <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />
              {totalOperacional.toLocaleString('pt-BR')} encontradas
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-300">
              <MonitorCheck className="h-3.5 w-3.5" />
              {concluidas.toLocaleString('pt-BR')} concluídas
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'total_nao_atendidas',
      header: 'Fora inventário',
      cell: ({ row }) => row.original.total_nao_atendidas.toLocaleString('pt-BR'),
    },
    {
      accessorKey: 'total_quarentena',
      header: 'Quarentena',
      cell: ({ row }) => row.original.total_quarentena.toLocaleString('pt-BR'),
    },
    {
      accessorKey: 'total_inconsistentes',
      header: 'Inconsistências',
      cell: ({ row }) => {
        const abertas = row.original.total_inconsistentes_abertas ?? row.original.total_inconsistentes
        return abertas > 0
        ? (
          <span className="inline-flex rounded-md bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-300">
            {abertas.toLocaleString('pt-BR')}
          </span>
        )
        : <span className="text-slate-500">Sem inconsistência aberta</span>
      },
    },
    {
      accessorKey: 'status_processamento',
      header: 'Status',
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={row.original.status_processamento} />
          {row.original.planner_resolvida && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
              <MonitorCheck className="h-3 w-3" />
              Resolvida
            </span>
          )}
        </div>
      ),
    },
  ], [])

  const totalEncontradas = overview.encontradas ?? overview.atendidas
  const totalComDesfecho = totalEncontradas + overview.nao_atendidas + overview.em_quarentena
  const taxaEncontradas = totalComDesfecho > 0
    ? Math.round((totalEncontradas / totalComDesfecho) * 100)
    : 0
  const selectedOperationalItems = selected?.itens.filter(isOperationalItem) ?? []
  const selectedPlannerConcluidas = selectedOperationalItems.filter(item => item.planner_status === 'concluido').length
  const selectedPlannerEmAtendimento = selectedOperationalItems.filter(item => item.planner_status === 'assumido').length
  const selectedPlannerPendentes = selectedOperationalItems.filter(item => (item.planner_status ?? 'pendente') === 'pendente').length
  const selectedIsResolved = selectedOperationalItems.length > 0 && selectedPlannerConcluidas === selectedOperationalItems.length
  const activeDateScopeLabel = DATE_SCOPES.find(scope => scope.value === dateScope)?.label ?? dateScope
  const snowSolicitacoesExportConfig: OverviewExportConfig<SnowSolicitacao> = {
    title: 'Overview SNOW - Solicitações',
    filename: 'overview-snow-solicitacoes',
    rows: exportSolicitacoes.length > 0 ? exportSolicitacoes : data,
    activeFilters: [{ kind: 'scope', value: dateScope, label: activeDateScopeLabel }],
    columns: [
      { key: 'recebida', header: 'Recebida', value: item => formatDateTime(item.recebido_em ?? item.criado_em) },
      { key: 'arquivo', header: 'Arquivo', value: item => item.nome_arquivo },
      { key: 'origem', header: 'Origem', value: item => item.origem_email },
      { key: 'tipo', header: 'Tipo', value: item => TIPO_LABELS[item.tipo_arquivo] ?? item.tipo_arquivo },
      { key: 'recebidos', header: 'Recebidos', value: item => item.total_recebido },
      { key: 'encontradas', header: 'Encontradas', value: item => totalEncontradasSolicitacao(item) },
      { key: 'encontradas_ok', header: 'Encontradas sem divergência', value: item => item.total_atendidas },
      { key: 'fora_inventario', header: 'Fora inventário', value: item => item.total_nao_atendidas },
      { key: 'quarentena', header: 'Quarentena', value: item => item.total_quarentena },
      { key: 'inconsistencias', header: 'Inconsistências abertas', value: item => item.total_inconsistentes_abertas ?? item.total_inconsistentes },
      { key: 'status', header: 'Status', value: item => STATUS_LABELS[item.status_processamento] ?? item.status_processamento },
      { key: 'erro', header: 'Erro', value: item => item.erro_processamento },
    ],
  }
  const snowMaquinasExportConfig: OverviewExportConfig<SnowItem> = {
    title: `Overview SNOW - ${machineFilterLabel(machineFilter)}`,
    filename: 'overview-snow-maquinas',
    rows: exportMachineItems.length > 0 ? exportMachineItems : machineItems,
    activeFilters: [
      { kind: 'scope', value: dateScope, label: activeDateScopeLabel },
      { kind: 'machine-filter', value: machineFilter, label: machineFilterLabel(machineFilter) },
    ],
    columns: [
      { key: 'ip', header: 'IP', value: item => item.ip || item.maquina?.endereco_ip },
      { key: 'hostname', header: 'Hostname', value: item => item.hostname || item.maquina?.nome_host },
      { key: 'identificador', header: 'Identificador', value: item => item.maquina?.identificador },
      { key: 'status', header: 'Status SNOW', value: item => STATUS_LABELS[item.status] ?? item.status },
      { key: 'planner', header: 'Status Planner', value: item => STATUS_LABELS[item.planner_status || 'pendente'] ?? item.planner_status ?? 'Pendente' },
      { key: 'csc_numero', header: 'Chamado CSC', value: item => item.csc_numero },
      { key: 'csc_criado_em', header: 'Criado no CSC', value: item => item.csc_criado_em },
      { key: 'colaborador', header: 'Colaborador', value: item => item.colaborador_alocado },
      { key: 'setor', header: 'Setor', value: item => item.setor_alocado },
      { key: 'localidade', header: 'Localidade', value: item => item.localidade_alocada },
      { key: 'arquivo', header: 'Arquivo', value: item => item.solicitacao_snow?.nome_arquivo },
      { key: 'motivo', header: 'Motivo', value: item => item.motivo },
      { key: 'ultima_revisao', header: 'Última revisão', value: item => item.ultima_revisao },
      { key: 'bloqueado_ate', header: 'Bloqueado até', value: item => item.bloqueado_ate },
      { key: 'atendente', header: 'Atendente', value: item => item.atendente_nome },
      { key: 'concluido_em', header: 'Concluído em', value: item => item.concluido_em },
    ],
  }
  const snowOverviewExportConfig: OverviewExportConfig<any> = viewMode === 'maquinas' ? snowMaquinasExportConfig : snowSolicitacoesExportConfig

  return (
    <div className="min-h-screen overflow-x-hidden px-4 py-4 text-slate-100 md:px-6 lg:px-7">
      <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-3">
        <PageHeader
          title="Snow"
          description="Acompanhamento das solicitações recebidas pelo fluxo operacional SNOW."
          total={viewMode === 'maquinas' ? machineTotal : total}
        />

        <section className="rounded-lg border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(720px,auto)] xl:items-start">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Visão operacional</p>
              <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Entrada SNOW</h2>
              <p className="mt-3 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                Solicitações processadas pelo Power Automate, cruzadas com o inventário oficial e acompanhadas por máquina.
              </p>
            </div>

            <div className="flex min-w-0 flex-col gap-2 xl:items-end">
              <div className="flex w-full flex-wrap items-center justify-start gap-2 xl:justify-end">
                <div className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950">
                  <button
                    type="button"
                    onClick={() => setViewMode('solicitacoes')}
                    title="Exibir solicitações"
                    aria-label="Exibir solicitações"
                    className={cn(
                      'inline-flex h-10 w-10 items-center justify-center rounded-md transition',
                      viewMode === 'solicitacoes'
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
                        : 'text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white'
                    )}
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => selectMachineFilter(machineFilter)}
                    title="Exibir máquinas"
                    aria-label="Exibir máquinas"
                    className={cn(
                      'inline-flex h-10 w-10 items-center justify-center rounded-md transition',
                      viewMode === 'maquinas'
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
                        : 'text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white'
                    )}
                  >
                    <Laptop className="h-4 w-4" />
                  </button>
                </div>
                <OverviewExportMenu config={snowOverviewExportConfig} />
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => router.push('/api/snow')}
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:bg-white hover:text-blue-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-blue-500/60 dark:hover:bg-slate-900 dark:hover:text-blue-200"
                    title="Abrir Swagger da API SNOW"
                    aria-label="Abrir Swagger da API SNOW"
                  >
                    <SquareCode className="h-4 w-4" />
                    Swagger
                  </button>
                )}
                {showSnowDevTools && (
                  <button
                    type="button"
                    onClick={() => setDevPanelOpen(open => !open)}
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-3 text-xs font-semibold text-violet-700 transition hover:border-violet-400 hover:bg-violet-100 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20"
                    title="Abrir ferramentas dev SNOW"
                    aria-label="Abrir ferramentas dev SNOW"
                  >
                    <Wrench className="h-4 w-4" />
                    Dev
                  </button>
                )}
                <div className="flex min-w-[320px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950 xl:max-w-[460px]">
                  <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Período
                  </span>
                  <div className="grid min-w-0 flex-1 grid-cols-4 gap-1">
                    {DATE_SCOPES.map(scope => (
                      <button
                        key={scope.value}
                        onClick={() => { setDateScope(scope.value); setPage(1); setMachinePage(1) }}
                        className={cn(
                          'h-8 min-w-0 rounded-md px-2 text-xs font-semibold transition',
                          dateScope === scope.value
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white'
                        )}
                      >
                        <span className="truncate">{scope.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <MetricCard
              label="Solicitações"
              value={overview.total_solicitacoes}
              icon={FileSpreadsheet}
              tone="bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200"
              description={`${taxaEncontradas}% encontradas`}
              active={viewMode === 'solicitacoes'}
              onClick={() => setViewMode('solicitacoes')}
            />
            <MetricCard
              label="Pendentes"
              value={overview.planner_pendentes ?? 0}
              icon={Clock3}
              tone="bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200"
              description="Sem conclusão no Planner"
              active={viewMode === 'maquinas' && machineFilter === 'pendentes'}
              onClick={() => selectMachineFilter('pendentes')}
            />
            <MetricCard
              label="Em atendimento"
              value={overview.planner_em_atendimento ?? 0}
              icon={Laptop}
              tone="bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-200"
              description="Assumidas no Planner"
              active={viewMode === 'maquinas' && machineFilter === 'em_atendimento'}
              onClick={() => selectMachineFilter('em_atendimento')}
            />
            <MetricCard
              label="Resolvidas"
              value={overview.planner_resolvidas ?? 0}
              icon={MonitorCheck}
              tone="bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"
              description="Concluídas no Planner"
              active={viewMode === 'maquinas' && machineFilter === 'resolvidas'}
              onClick={() => selectMachineFilter('resolvidas')}
            />
            <MetricCard
              label="Quarentena"
              value={overview.em_quarentena}
              icon={ShieldAlert}
              tone="bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200"
              description="Recorrência antes de 15 dias"
              active={viewMode === 'maquinas' && machineFilter === 'quarentena'}
              onClick={() => selectMachineFilter('quarentena')}
            />
            <MetricCard
              label="Inconsistentes"
              value={overview.inconsistentes}
              icon={AlertTriangle}
              tone="bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200"
              description="IP ou hostname divergente"
              active={viewMode === 'maquinas' && machineFilter === 'inconsistentes'}
              onClick={() => selectMachineFilter('inconsistentes')}
            />
          </div>

          {showSnowDevTools && devPanelOpen && (
            <div className="mt-4 rounded-lg border border-violet-300/50 bg-violet-50/70 p-3 dark:border-violet-500/25 dark:bg-violet-500/10">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-violet-500/10 p-1.5 text-violet-700 dark:text-violet-200">
                    <Wrench className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Ferramentas dev SNOW</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">POSTs internos para processamento manual e fechamento operacional.</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-2 lg:grid-cols-[minmax(180px,1fr)_220px_minmax(180px,1fr)_auto]">
                <label className="flex h-10 min-w-0 cursor-pointer items-center gap-2 rounded-md border border-violet-200 bg-white px-3 text-xs font-medium text-slate-600 transition hover:border-violet-400 dark:border-violet-500/30 dark:bg-slate-950 dark:text-slate-300">
                  <Upload className="h-4 w-4 shrink-0 text-violet-500" />
                  <span className="truncate">{devXlsxFile?.name || 'Selecionar arquivo .xlsx'}</span>
                  <input
                    type="file"
                    accept=".xlsx"
                    className="sr-only"
                    onChange={event => setDevXlsxFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                <input
                  value={devOrigemEmail}
                  onChange={event => setDevOrigemEmail(event.target.value)}
                  placeholder="Origem do e-mail"
                  className="h-10 rounded-md border border-violet-200 bg-white px-3 text-xs font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 dark:border-violet-500/30 dark:bg-slate-950 dark:text-slate-100"
                />
                <input
                  value={devAssuntoEmail}
                  onChange={event => setDevAssuntoEmail(event.target.value)}
                  placeholder="Assunto opcional"
                  className="h-10 rounded-md border border-violet-200 bg-white px-3 text-xs font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 dark:border-violet-500/30 dark:bg-slate-950 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={processDevXlsx}
                  disabled={devProcessing || !devXlsxFile}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-violet-600 px-3 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {devProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Processar
                </button>
              </div>
            </div>
          )}
        </section>

        <AnimatePresence mode="wait" initial={false}>
          {viewMode === 'solicitacoes' ? (
            <motion.div
              key="solicitacoes"
              className="min-w-0"
              initial={reduceMotion ? false : { opacity: 0, y: 10, filter: 'blur(2px)' }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8, filter: 'blur(2px)' }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <DataTable
                columns={columns}
                data={data}
                total={total}
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                onRowClick={openDetail}
                isLoading={loading}
              />
            </motion.div>
          ) : (
          <motion.section
            key="maquinas"
            className="rounded-lg border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
            initial={reduceMotion ? false : { opacity: 0, y: 10, filter: 'blur(2px)' }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -8, filter: 'blur(2px)' }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-blue-50 p-1.5 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">
                  <Laptop className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Máquinas apontadas</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Exibindo máquinas {machineFilterLabel(machineFilter)}, com responsável do chamado quando houver.
                  </p>
                </div>
              </div>
              <span className="text-xs text-slate-500">{machineTotal.toLocaleString('pt-BR')} registros</span>
            </div>

            {machineLoading ? (
              <div className="flex h-64 items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando máquinas
              </div>
            ) : machineItems.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-sm text-slate-500">
                <Rows3 className="mb-2 h-6 w-6" />
                Nenhuma máquina encontrada no escopo selecionado.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {machineItems.map(item => {
                  const isQuarantine = item.status === 'em_quarentena'
                  const hasOriginInconsistency = isOriginInconsistent(item)
                  return (
                  <motion.button
                    key={item.id}
                    onClick={() => isQuarantine ? openQuarantineInspect(item) : machineFilter === 'inconsistentes' && hasOriginInconsistency ? openInconsistentInspect(item) : openOperationalInspect(item)}
                    disabled={item.status === 'nao_atendida'}
                    layout
                    whileHover={reduceMotion ? undefined : { y: -2 }}
                    whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                    className={cn(
                      'group flex min-w-0 flex-col rounded-lg border border-slate-100 bg-slate-50 p-4 text-left transition hover:border-blue-300 hover:bg-white dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-blue-500/60 dark:hover:bg-slate-950',
                      isQuarantine && 'border-amber-300/70 bg-amber-50/70 hover:border-amber-400 dark:border-amber-500/30 dark:bg-amber-500/10 dark:hover:border-amber-400/70',
                      machineFilter === 'inconsistentes' && hasOriginInconsistency && 'border-rose-300/70 bg-rose-50/70 hover:border-rose-400 dark:border-rose-500/30 dark:bg-rose-500/10 dark:hover:border-rose-400/70',
                      item.status === 'nao_atendida' && 'cursor-default hover:translate-y-0 hover:border-slate-100 hover:bg-slate-50 dark:hover:border-slate-800 dark:hover:bg-slate-950/60',
                      navigatingItemId === item.id && 'border-blue-400 bg-blue-50 ring-2 ring-blue-500/40 dark:border-blue-500 dark:bg-blue-500/10'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <OperationalStatusIcon item={item} />
                        <div className="min-w-0">
                          <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-slate-900 dark:text-white">
                            <span className="truncate">{machineTitle(item)}</span>
                          </p>
                          <p className="truncate text-xs text-slate-500">{item.ip || item.maquina?.endereco_ip || 'Sem IP'} · {operationalStatusLabel(item)}</p>
                        </div>
                      </div>
                      {navigatingItemId === item.id ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-400" />
                      ) : isQuarantine ? (
                        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 transition group-hover:scale-110" />
                      ) : hasOriginInconsistency ? (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 transition group-hover:scale-110" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-400" />
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      {isQuarantine ? (
                        <>
                          <div className="rounded-md bg-white px-3 py-2 dark:bg-slate-900">
                            <p className="text-slate-500">Controle</p>
                            <p className="mt-0.5 truncate font-medium text-amber-700 dark:text-amber-200">Sem chamado</p>
                          </div>
                          <div className="rounded-md bg-white px-3 py-2 dark:bg-slate-900">
                            <p className="text-slate-500">Saída</p>
                            <p className="mt-0.5 truncate font-medium text-slate-800 dark:text-slate-100">{quarantineCountdownText(item.bloqueado_ate)}</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="rounded-md bg-white px-3 py-2 dark:bg-slate-900">
                            <p className="text-slate-500">Responsável</p>
                            <p className="mt-0.5 truncate font-medium text-slate-800 dark:text-slate-100">{item.atendente_nome || 'Sem atendente'}</p>
                          </div>
                          <div className="rounded-md bg-white px-3 py-2 dark:bg-slate-900">
                            <p className="text-slate-500">Planner</p>
                            <p className="mt-0.5 font-medium text-slate-800 dark:text-slate-100">{STATUS_LABELS[item.planner_status || 'pendente']}</p>
                          </div>
                        </>
                      )}
                      <div className="rounded-md bg-white px-3 py-2 dark:bg-slate-900">
                        <p className="text-slate-500">Setor</p>
                        <p className="mt-0.5 truncate font-medium text-slate-800 dark:text-slate-100">{item.setor_alocado || '-'}</p>
                      </div>
                      <div className="rounded-md bg-white px-3 py-2 dark:bg-slate-900">
                        <p className="text-slate-500">Tipo SNOW</p>
                        <p className="mt-0.5 truncate font-medium text-slate-800 dark:text-slate-100">
                          {TIPO_LABELS[item.solicitacao_snow?.tipo_arquivo ?? item.tipo_arquivo] ?? item.solicitacao_snow?.tipo_arquivo ?? item.tipo_arquivo}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">
                          {formatDateTime(item.solicitacao_snow?.recebido_em ?? item.criado_em)}
                        </p>
                      </div>
                      {isQuarantine && (
                        <div className="col-span-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                          <p className="text-[11px] font-semibold uppercase tracking-wide">Inspeção Snow</p>
                          <p className="mt-0.5 truncate">
                            {quarantineCountdownText(item.bloqueado_ate)} para liberar nova tratativa.
                          </p>
                        </div>
                      )}
                      {hasOriginInconsistency && (
                        <div className="col-span-2 rounded-md border border-rose-200/80 bg-rose-50/60 px-3 py-2 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
                          <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide">
                            <AlertTriangle className="h-3 w-3" />
                            Inconsistente por origem
                          </p>
                          {machineFilter === 'inconsistentes' && (
                            <p className="mt-0.5 line-clamp-2">{item.motivo || 'IP ou hostname diverge do cadastro oficial.'}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.button>
                  )
                })}
              </div>
            )}

            <div className="mt-3 flex items-center justify-end gap-2">
              <button disabled={machinePage <= 1} onClick={() => setMachinePage(page => Math.max(1, page - 1))} className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300">Anterior</button>
              <span className="text-xs text-slate-500">{machinePage} / {machineTotalPages}</span>
              <button disabled={machinePage >= machineTotalPages} onClick={() => setMachinePage(page => Math.min(machineTotalPages, page + 1))} className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300">Próxima</button>
            </div>
          </motion.section>
        )}
        </AnimatePresence>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3" role="dialog" aria-modal="true">
          <div className="flex h-[min(92vh,860px)] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5 dark:border-slate-800">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Solicitação SNOW</p>
                <h2 className="truncate text-xl font-bold text-slate-900 dark:text-white">{selected.nome_arquivo}</h2>
                <p className="mt-1 text-sm text-slate-500">{TIPO_LABELS[selected.tipo_arquivo] ?? selected.tipo_arquivo}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {showSnowDevTools && selectedOperationalItems.some(item => item.planner_status !== 'concluido') && (
                  <>
                    <select
                      value={devUsuarioId}
                      onChange={event => setDevUsuarioId(event.target.value)}
                      className="h-9 max-w-[220px] rounded-lg border border-violet-300 bg-white px-2 text-xs font-semibold text-slate-800 outline-none transition focus:border-violet-500 dark:border-violet-500/40 dark:bg-slate-950 dark:text-slate-100"
                      aria-label="Usuário responsável"
                    >
                      {devUsuarios.length === 0 ? (
                        <option value="">Sem usuário</option>
                      ) : devUsuarios.map(usuario => (
                        <option key={usuario.id} value={usuario.id}>
                          {usuario.nome}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => completeDevSnow({ solicitacaoId: selected.id })}
                      disabled={devCompleting === `solicitacao:${selected.id}` || !devUsuarioId}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-3 text-xs font-semibold text-violet-700 transition hover:border-violet-400 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20"
                    >
                      {devCompleting === `solicitacao:${selected.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <MonitorCheck className="h-4 w-4" />}
                      Concluir solicitação
                    </button>
                  </>
                )}
                <button onClick={closeDetail} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar detalhe">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="grid gap-4 border-b border-slate-100 p-4 text-sm dark:border-slate-800 lg:grid-cols-[minmax(0,1.15fr)_180px_140px_minmax(360px,1fr)]">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500">Origem</p>
                <p className="truncate font-medium text-slate-800 dark:text-slate-100">{selected.origem_email || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Recebido em</p>
                <p className="font-medium text-slate-800 dark:text-slate-100">{formatDateTime(selected.recebido_em ?? selected.criado_em)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Status</p>
                <StatusBadge status={selected.status_processamento} />
              </div>
              <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/50">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-slate-500">Andamento</p>
                  {selectedIsResolved && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                      <CheckCircle2 className="h-3 w-3" />
                      Resolvida
                    </span>
                  )}
                </div>
                <div className="grid gap-1.5 sm:grid-cols-3">
                  <span className="inline-flex min-w-0 items-center justify-center gap-1 rounded-md bg-blue-500/10 px-2 py-1 text-xs font-semibold text-blue-600 dark:text-blue-300">
                    <Clock3 className="h-3 w-3" />
                    <span className="truncate">{selectedPlannerPendentes} pendentes</span>
                  </span>
                  <span className="inline-flex min-w-0 items-center justify-center gap-1 rounded-md bg-cyan-500/10 px-2 py-1 text-xs font-semibold text-cyan-600 dark:text-cyan-300">
                    <Laptop className="h-3 w-3" />
                    <span className="truncate">{selectedPlannerEmAtendimento} em atendimento</span>
                  </span>
                  <span className="inline-flex min-w-0 items-center justify-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                    <MonitorCheck className="h-3 w-3" />
                    <span className="truncate">{selectedPlannerConcluidas} concluídas</span>
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>{totalEncontradasSolicitacao(selected)} encontradas</span>
                  <span>{selected.total_inconsistentes_abertas ?? selected.total_inconsistentes} inconsistentes abertas</span>
                  <span>{selected.total_quarentena} quarentena</span>
                  <span>{selected.total_nao_atendidas} fora</span>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {detailLoading ? (
                <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando itens
                </div>
              ) : (
                <div className="grid gap-2">
                  {selected.itens.map(item => {
                    const canOpen = Boolean(item.maquina_id && ['atendida', 'em_quarentena', 'inconsistente'].includes(item.status))
                    const hasOriginInconsistency = isOriginInconsistent(item)
                    return (
                      <button
                        key={item.id}
                        onClick={() => item.status === 'em_quarentena' ? openQuarantineInspect(item) : openOperationalInspect(item)}
                        disabled={!canOpen}
                        className={cn(
                          'grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-left transition dark:border-slate-800 dark:bg-slate-900/70 lg:grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]',
                          canOpen && 'hover:border-blue-300 hover:bg-white dark:hover:border-blue-500/60 dark:hover:bg-slate-900',
                          item.status === 'em_quarentena' && 'border-amber-300/70 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10',
                          hasOriginInconsistency && 'border-rose-300/40 dark:border-rose-500/20',
                          !canOpen && 'cursor-default opacity-80'
                        )}
                      >
                        <OperationalStatusIcon item={item} />
                        <div className="min-w-0">
                          <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-slate-900 dark:text-white">
                            <span className="truncate">{item.hostname || item.maquina?.nome_host || 'Sem hostname'}</span>
                            {hasOriginInconsistency && (
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-400" aria-label="Inconsistente por origem SNOW" />
                            )}
                          </p>
                          <p className="truncate text-xs text-slate-500">{item.ip || item.maquina?.endereco_ip || 'Sem IP'} · {operationalStatusLabel(item)}</p>
                        </div>
                        <div className="hidden min-w-0 lg:block">
                          <p className="truncate text-xs text-slate-500">Colaborador</p>
                          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{item.colaborador_alocado || '-'}</p>
                        </div>
                        <div className="hidden min-w-0 lg:block">
                          <p className="truncate text-xs text-slate-500">Setor / Localidade</p>
                          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{item.setor_alocado || '-'} · {item.localidade_alocada || '-'}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {isOperationalItem(item) && (
                            <span className={cn('hidden items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold sm:inline-flex', STATUS_TONES[item.planner_status || 'pendente'])}>
                              {operationalStatusLabel(item)}
                            </span>
                          )}
                          {hasOriginInconsistency && (
                            <span className="hidden max-w-[220px] items-center gap-1 truncate rounded-md bg-rose-500/10 px-2 py-1 text-xs text-rose-300 sm:inline-flex">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              <span className="truncate">{item.motivo || 'Inconsistente por origem'}</span>
                            </span>
                          )}
                          {item.status === 'em_quarentena' && (
                            <span className="hidden items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-200 sm:inline-flex">
                              <Clock3 className="h-3 w-3" />
                              {quarantineCountdownText(item.bloqueado_ate)}
                            </span>
                          )}
                          {canOpen && <ChevronRight className="h-4 w-4 text-slate-400" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {operationalInspect && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3" role="dialog" aria-modal="true">
          <motion.div
            className="flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-blue-300/40 bg-white shadow-2xl dark:border-blue-500/30 dark:bg-slate-950"
            initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.98 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-blue-200/70 bg-blue-50 p-5 dark:border-blue-500/20 dark:bg-blue-500/10">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <OperationalStatusIcon item={operationalInspect} />
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-200">Atendimento SNOW</p>
                  {isOriginInconsistent(operationalInspect) && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-200">
                      <AlertTriangle className="h-3 w-3" />
                      Inconsistente por origem
                    </span>
                  )}
                </div>
                <h2 className="mt-1 truncate text-xl font-bold text-slate-900 dark:text-white">{machineTitle(operationalInspect)}</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {operationalStatusLabel(operationalInspect)} no fluxo operacional do Planner.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {showSnowDevTools && operationalInspect.planner_status !== 'concluido' && (
                  <>
                    <select
                      value={devUsuarioId}
                      onChange={event => setDevUsuarioId(event.target.value)}
                      className="h-9 max-w-[200px] rounded-lg border border-violet-300 bg-white px-2 text-xs font-semibold text-slate-800 outline-none transition focus:border-violet-500 dark:border-violet-500/40 dark:bg-slate-950 dark:text-slate-100"
                      aria-label="Usuário responsável"
                    >
                      {devUsuarios.length === 0 ? (
                        <option value="">Sem usuário</option>
                      ) : devUsuarios.map(usuario => (
                        <option key={usuario.id} value={usuario.id}>
                          {usuario.nome}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => assignDevSnowItem(operationalInspect.id)}
                      disabled={devAssigning === operationalInspect.id || !devUsuarioId}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-cyan-300 bg-white px-3 text-xs font-semibold text-cyan-700 transition hover:border-cyan-400 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-500/40 dark:bg-slate-950 dark:text-cyan-200 dark:hover:bg-cyan-500/10"
                    >
                      {devAssigning === operationalInspect.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                      Atribuir
                    </button>
                    <button
                      type="button"
                      onClick={() => completeDevSnow({ itemId: operationalInspect.id })}
                      disabled={devCompleting === `item:${operationalInspect.id}` || !devUsuarioId}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-violet-300 bg-white px-3 text-xs font-semibold text-violet-700 transition hover:border-violet-400 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-500/40 dark:bg-slate-950 dark:text-violet-200 dark:hover:bg-violet-500/10"
                    >
                      {devCompleting === `item:${operationalInspect.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <MonitorCheck className="h-4 w-4" />}
                      Concluir
                    </button>
                  </>
                )}
                <button onClick={() => setOperationalInspect(null)} className="rounded-lg p-2 text-slate-500 hover:bg-white/70 dark:hover:bg-slate-900" aria-label="Fechar atendimento">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="grid gap-3 border-b border-slate-100 p-4 text-sm dark:border-slate-800 md:grid-cols-3">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs text-slate-500">Status Planner</p>
                <div className="mt-1">
                  <StatusBadge status={operationalInspect.planner_status || 'pendente'} />
                </div>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs text-slate-500">Atendente</p>
                <p className="mt-1 truncate font-medium text-slate-800 dark:text-slate-100">{operationalInspect.atendente_nome || '-'}</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs text-slate-500">{operationalInspect.planner_status === 'concluido' ? 'Concluído em' : 'Assumido em'}</p>
                <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">
                  {formatDateTime(operationalInspect.planner_status === 'concluido' ? operationalInspect.concluido_em : operationalInspect.assumido_em)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70 md:col-span-2">
                <p className="text-xs text-slate-500">Chamado CSC</p>
                <p className="mt-1 truncate font-medium text-slate-800 dark:text-slate-100">{operationalInspect.csc_numero || 'Não vinculado'}</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs text-slate-500">Criado no CSC</p>
                <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{formatDateTime(operationalInspect.csc_criado_em)}</p>
              </div>
            </div>

            <div className="grid gap-3 p-4 text-sm md:grid-cols-2">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Máquina</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-500">Hostname</p>
                    <p className="truncate font-medium text-slate-800 dark:text-slate-100">{operationalInspect.hostname || operationalInspect.maquina?.nome_host || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">IP</p>
                    <p className="font-medium text-slate-800 dark:text-slate-100">{operationalInspect.ip || operationalInspect.maquina?.endereco_ip || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Colaborador</p>
                    <p className="truncate font-medium text-slate-800 dark:text-slate-100">{operationalInspect.colaborador_alocado || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Setor / Localidade</p>
                    <p className="truncate font-medium text-slate-800 dark:text-slate-100">{operationalInspect.setor_alocado || '-'} · {operationalInspect.localidade_alocada || '-'}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Solicitação</p>
                <p className="mt-3 truncate font-medium text-slate-800 dark:text-slate-100">
                  {operationalInspect.solicitacao_snow?.nome_arquivo ?? selected?.nome_arquivo ?? 'Solicitação SNOW'}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-500">Tipo</p>
                    <p className="truncate font-medium text-slate-800 dark:text-slate-100">
                      {TIPO_LABELS[operationalInspect.solicitacao_snow?.tipo_arquivo ?? operationalInspect.tipo_arquivo] ?? operationalInspect.tipo_arquivo}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Recebido em</p>
                    <p className="font-medium text-slate-800 dark:text-slate-100">
                      {formatDateTime(operationalInspect.solicitacao_snow?.recebido_em ?? operationalInspect.solicitacao_snow?.criado_em ?? selected?.recebido_em ?? selected?.criado_em ?? operationalInspect.criado_em)}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-slate-500">Origem</p>
                    <p className="truncate font-medium text-slate-800 dark:text-slate-100">{operationalInspect.solicitacao_snow?.origem_email ?? selected?.origem_email ?? '-'}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 md:col-span-2 sm:flex-row">
                {operationalInspect.maquina_id && (
                  <button
                    type="button"
                    onClick={() => {
                      setOperationalInspect(null)
                      openMachineInspect(operationalInspect)
                    }}
                    className="flex-1 rounded-lg border border-blue-500/40 bg-slate-950 px-3 py-2 text-left text-blue-100 shadow-sm shadow-blue-950/20 transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-950/40 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400/60 dark:border-blue-500/40 dark:bg-slate-950 dark:text-blue-100 dark:hover:border-blue-300"
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide">Inspecionar máquina</span>
                    <span className="mt-0.5 block text-sm">Abrir o cadastro relacionado no inventário.</span>
                  </button>
                )}
                {(operationalInspect.solicitacao_snow?.id ?? selected?.id) && (
                  <button
                    type="button"
                    onClick={() => {
                      setOperationalInspect(null)
                      openSnowSolicitationFromInspect(operationalInspect.solicitacao_snow?.id ?? selected!.id, operationalInspect.id)
                    }}
                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-slate-700 transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-blue-500/50 dark:hover:bg-slate-900"
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide">Abrir solicitação</span>
                    <span className="mt-0.5 block text-sm">Ver este item no contexto da solicitação SNOW.</span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {quarantineInspect && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3" role="dialog" aria-modal="true">
          <motion.div
            className="flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-amber-300/40 bg-white shadow-2xl dark:border-amber-500/30 dark:bg-slate-950"
            initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.98 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-amber-200/70 bg-amber-50 p-5 dark:border-amber-500/20 dark:bg-amber-500/10">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-amber-500" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-200">Quarentena SNOW</p>
                </div>
                <h2 className="mt-1 truncate text-xl font-bold text-slate-900 dark:text-white">{machineTitle(quarantineInspect)}</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{quarantineInspect.motivo || 'Máquina repetida dentro da janela de 15 dias.'}</p>
              </div>
              <button onClick={() => setQuarantineInspect(null)} className="rounded-lg p-2 text-slate-500 hover:bg-white/70 dark:hover:bg-slate-900" aria-label="Fechar quarentena">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3 border-b border-slate-100 p-4 text-sm dark:border-slate-800 md:grid-cols-3">
              <div>
                <p className="text-xs text-slate-500">Hostname</p>
                <p className="truncate font-medium text-slate-800 dark:text-slate-100">{quarantineInspect.hostname || quarantineInspect.maquina?.nome_host || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">IP</p>
                <p className="font-medium text-slate-800 dark:text-slate-100">{quarantineInspect.ip || quarantineInspect.maquina?.endereco_ip || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Bloqueado até</p>
                <p className="font-medium text-amber-700 dark:text-amber-200">{formatDate(quarantineInspect.bloqueado_ate)}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{quarantineCountdownText(quarantineInspect.bloqueado_ate)}</p>
              </div>
              {quarantineInspect.maquina_id && (
                <button
                  type="button"
                  onClick={() => {
                    setQuarantineInspect(null)
                    openMachineInspect(quarantineInspect)
                  }}
                  className="rounded-lg border border-amber-500/40 bg-slate-950 px-3 py-2 text-left text-amber-100 transition hover:border-amber-300 hover:bg-amber-950/40 dark:border-amber-500/40 dark:bg-slate-950 dark:text-amber-100 dark:hover:border-amber-300 md:col-span-3"
                >
                  <span className="text-xs font-semibold uppercase tracking-wide">Inspecionar máquina</span>
                  <span className="mt-0.5 block text-sm">Abrir esta máquina na guia de máquinas do inventário.</span>
                </button>
              )}
            </div>

            <div className="max-h-[50vh] overflow-y-auto p-4">
              <p className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Incidências registradas</p>
              {(quarantineInspect.repeticoes?.length ?? 0) === 0 ? (
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
                  Nenhuma solicitação anterior foi encontrada para exibição.
                </div>
              ) : (
                <div className="space-y-2">
                  {quarantineInspect.repeticoes?.map(repeticao => (
                    <button
                      key={repeticao.id}
                      type="button"
                      onClick={() => {
                        if (repeticao.solicitacao_snow) {
                          openSnowSolicitationFromInspect(repeticao.solicitacao_snow.id, repeticao.id)
                        }
                      }}
                      className="w-full rounded-lg border border-slate-100 bg-slate-50 p-3 text-left transition hover:border-amber-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-amber-500/50 dark:hover:bg-slate-900"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{repeticao.solicitacao_snow?.nome_arquivo || 'Solicitação SNOW'}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{formatDateTime(repeticao.solicitacao_snow?.recebido_em ?? repeticao.solicitacao_snow?.criado_em ?? repeticao.criado_em)}</p>
                        </div>
                        <StatusBadge status={repeticao.status} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {inconsistentInspect && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3" role="dialog" aria-modal="true">
          <motion.div
            className="flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-rose-300/40 bg-white shadow-2xl dark:border-rose-500/30 dark:bg-slate-950"
            initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.98 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-rose-200/70 bg-rose-50 p-5 dark:border-rose-500/20 dark:bg-rose-500/10">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-rose-500" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-200">Inconsistência SNOW</p>
                </div>
                <h2 className="mt-1 truncate text-xl font-bold text-slate-900 dark:text-white">{machineTitle(inconsistentInspect)}</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{inconsistentInspect.motivo || 'IP ou hostname diverge do cadastro oficial do inventário.'}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {showSnowDevTools && inconsistentInspect.planner_status !== 'concluido' && (
                  <>
                    <select
                      value={devUsuarioId}
                      onChange={event => setDevUsuarioId(event.target.value)}
                      className="h-9 max-w-[200px] rounded-lg border border-violet-300 bg-white px-2 text-xs font-semibold text-slate-800 outline-none transition focus:border-violet-500 dark:border-violet-500/40 dark:bg-slate-950 dark:text-slate-100"
                      aria-label="Usuário responsável"
                    >
                      {devUsuarios.length === 0 ? (
                        <option value="">Sem usuário</option>
                      ) : devUsuarios.map(usuario => (
                        <option key={usuario.id} value={usuario.id}>
                          {usuario.nome}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => assignDevSnowItem(inconsistentInspect.id)}
                      disabled={devAssigning === inconsistentInspect.id || !devUsuarioId}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-cyan-300 bg-white px-3 text-xs font-semibold text-cyan-700 transition hover:border-cyan-400 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-500/40 dark:bg-slate-950 dark:text-cyan-200 dark:hover:bg-cyan-500/10"
                    >
                      {devAssigning === inconsistentInspect.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                      Atribuir
                    </button>
                    <button
                      type="button"
                      onClick={() => completeDevSnow({ itemId: inconsistentInspect.id })}
                      disabled={devCompleting === `item:${inconsistentInspect.id}` || !devUsuarioId}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-violet-300 bg-white px-3 text-xs font-semibold text-violet-700 transition hover:border-violet-400 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-500/40 dark:bg-slate-950 dark:text-violet-200 dark:hover:bg-violet-500/10"
                    >
                      {devCompleting === `item:${inconsistentInspect.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <MonitorCheck className="h-4 w-4" />}
                      Concluir
                    </button>
                  </>
                )}
                <button onClick={() => setInconsistentInspect(null)} className="rounded-lg p-2 text-slate-500 hover:bg-white/70 dark:hover:bg-slate-900" aria-label="Fechar inconsistência">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="grid gap-3 border-b border-slate-100 p-4 text-sm dark:border-slate-800 md:grid-cols-2">
              <div className="rounded-lg border border-rose-100 bg-rose-50/70 p-3 dark:border-rose-500/20 dark:bg-rose-500/10">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-200">Dados enviados pelo SNOW</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-500">Hostname SNOW</p>
                    <p className="truncate font-medium text-slate-800 dark:text-slate-100">{inconsistentInspect.hostname || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">IP SNOW</p>
                    <p className="font-medium text-slate-800 dark:text-slate-100">{inconsistentInspect.ip || '-'}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cadastro no inventário</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-500">Hostname cadastrado</p>
                    <p className="truncate font-medium text-slate-800 dark:text-slate-100">{inconsistentInspect.maquina?.nome_host || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">IP cadastrado</p>
                    <p className="font-medium text-slate-800 dark:text-slate-100">{inconsistentInspect.maquina?.endereco_ip || '-'}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs text-slate-500">Tipo de solicitação</p>
                <p className="mt-0.5 font-medium text-slate-800 dark:text-slate-100">
                  {TIPO_LABELS[inconsistentInspect.solicitacao_snow?.tipo_arquivo ?? inconsistentInspect.tipo_arquivo] ?? inconsistentInspect.tipo_arquivo}
                </p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs text-slate-500">Recebido em</p>
                <p className="mt-0.5 font-medium text-slate-800 dark:text-slate-100">{formatDateTime(inconsistentInspect.solicitacao_snow?.recebido_em ?? inconsistentInspect.criado_em)}</p>
              </div>

              <div className="flex flex-col gap-2 md:col-span-2 sm:flex-row">
                {inconsistentInspect.maquina_id && (
                  <button
                    type="button"
                    onClick={() => {
                      setInconsistentInspect(null)
                      openMachineInspect(inconsistentInspect)
                    }}
                    className="flex-1 rounded-lg border border-rose-500/40 bg-slate-950 px-3 py-2 text-left text-rose-100 shadow-sm shadow-rose-950/20 transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-950/40 hover:text-white focus:outline-none focus:ring-2 focus:ring-rose-400/60 dark:border-rose-500/40 dark:bg-slate-950 dark:text-rose-100 dark:hover:border-rose-300"
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide">Inspecionar máquina</span>
                    <span className="mt-0.5 block text-sm">Abrir o cadastro relacionado no inventário.</span>
                  </button>
                )}
                {(inconsistentInspect.solicitacao_snow?.id ?? selected?.id) && (
                  <button
                    type="button"
                    onClick={() => openSnowSolicitationFromInspect(inconsistentInspect.solicitacao_snow?.id ?? selected!.id, inconsistentInspect.id)}
                    className="flex-1 rounded-lg border border-rose-500/40 bg-slate-950 px-3 py-2 text-left text-rose-100 shadow-sm shadow-rose-950/20 transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-950/40 hover:text-white focus:outline-none focus:ring-2 focus:ring-rose-400/60 dark:border-rose-500/40 dark:bg-slate-950 dark:text-rose-100 dark:hover:border-rose-300"
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide">Abrir solicitação</span>
                    <span className="mt-0.5 block text-sm">Ver este item dentro da solicitação SNOW.</span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
