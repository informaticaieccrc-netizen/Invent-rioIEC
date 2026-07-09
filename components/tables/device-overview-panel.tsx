'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  GitPullRequest,
  Layers3,
  MapPin,
  MessageSquare,
  ShieldAlert,
  Users,
} from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import type { AlocacaoAtiva } from '@/types'
import { ACAO_LABELS, type AuditLog } from '@/lib/audit-constants'
import { toast } from 'sonner'
import { OverviewExportMenu, type OverviewExportConfig } from '@/components/tables/overview-export-menu'

type DeviceOverviewAllocation = Omit<AlocacaoAtiva, 'colaborador'> & {
  colaborador?: AlocacaoAtiva['colaborador']
}

export interface DeviceOverviewItem {
  id: string
  nome_host?: string | null
  identificador?: string | null
  setor?: string | null
  setor_nome?: string | null
  localidade_id?: string | null
  localidade_nome?: string | null
  modelo?: string | null
  tipo?: number | string | null
  chip?: boolean | null
  endereco_ip?: string | null
  endereco_mac?: string | null
  status?: boolean | null
  fabricante?: string | null
  categoria?: string | null
  processador?: string | null
  memoria?: string | null
  memoria_ram?: string | null
  armazenamento?: string | null
  numero_patrimonio?: string | null
  patrimonio_cpu?: string | null
  patrimonio_monitor?: string | null
  numero_ramal?: string | null
  prefixo_telefonico?: string | null
  disponibilidade?: string | null
  fila?: boolean | null
  senha_acesso?: string | null
  emprestado?: boolean | null
  created_at?: string | null
  data_revisao?: string | null
  ultima_revisao?: string | null
  alocacao_ativa?: DeviceOverviewAllocation | null
  alocacoes_ativas?: DeviceOverviewAllocation[]
}

export interface OverviewFilter {
  kind: string
  value?: string
  label?: string
  color?: string
  tone?: 'default' | 'success' | 'warning' | 'danger'
}

interface OverviewMetric {
  label: string
  value: string
  icon: ReactNode
  tone?: 'default' | 'success' | 'warning' | 'danger'
  filter?: OverviewFilter
}

interface OverviewListItem {
  label: string
  value: string
  detail?: string
  color?: string
  tone?: 'default' | 'success' | 'warning' | 'danger'
  filter?: OverviewFilter
}

interface OverviewListSection {
  title: string
  icon?: ReactNode
  items: OverviewListItem[]
  emptyMessage: string
  layout?: 'full' | 'half'
}

interface ActiveOverviewFilterState {
  kind: string
  value?: string
  label?: string
  color?: string
  tone?: 'default' | 'success' | 'warning' | 'danger'
}

interface DeviceOverviewPanelProps<T extends DeviceOverviewItem> {
  title: string
  total: number
  items: T[]
  accentClassName: string
  activeFilters?: ActiveOverviewFilterState[]
  isLoading?: boolean
  onFilter?: (filter: OverviewFilter) => void
  exportConfig?: OverviewExportConfig<any>
}

interface ImpressoraOverviewPanelProps {
  total: number
  items: Array<{
    id: string
    nome_host: string | null
    fabricante: string | null
    modelo: string | null
    numero_serie: string | null
    endereco_ip: string | null
    andar: string | null
    setor_id?: string | null
    setor_nome?: string | null
    localidade_id?: string | null
    localidade_nome?: string | null
    revisao: string | null
    status: boolean | null
  }>
  activeFilters?: ActiveOverviewFilterState[]
  isLoading?: boolean
  onFilter?: (filter: OverviewFilter) => void
  exportConfig?: OverviewExportConfig<any>
}

interface RackOverviewPanelProps {
  total: number
  items: Array<{
    id: string
    nome_switch: string | null
    localizacao: string | null
    localidade_id?: string | null
    localidade_nome?: string | null
    quantidade_portas: number | null
    portas_em_uso: number | null
    portas_livres: number | null
    created_at: string | null
  }>
  activeFilters?: ActiveOverviewFilterState[]
  isLoading?: boolean
  onFilter?: (filter: OverviewFilter) => void
  exportConfig?: OverviewExportConfig<any>
}

interface ColaboradorOverviewPanelProps {
  total: number
  items: Array<{
    id: string
    setor_nome?: string | null
    localidade_id?: string | null
    localidade_nome?: string | null
    status: string
    alocacoes_maquinas_ativas?: number
    alocacoes_notebooks_ativas?: number
    alocacoes_aparelhos_ativas?: number
    alocacoes_ramais_ativas?: number
  }>
  metricTotal?: number
  metricItems?: Array<{
    id: string
    setor_nome?: string | null
    localidade_id?: string | null
    localidade_nome?: string | null
    status: string
    alocacoes_maquinas_ativas?: number
    alocacoes_notebooks_ativas?: number
    alocacoes_aparelhos_ativas?: number
    alocacoes_ramais_ativas?: number
  }>
  activeFilters?: ActiveOverviewFilterState[]
  isLoading?: boolean
  onFilter?: (filter: OverviewFilter) => void
  exportConfig?: OverviewExportConfig<any>
}

interface AuditOverviewPanelProps {
  total: number
  items: AuditLog[]
  activeFilters?: ActiveOverviewFilterState[]
  isLoading?: boolean
  onFilter?: (filter: OverviewFilter) => void
  exportConfig?: OverviewExportConfig<any>
}

type PieChartItem = {
  distribution: number
  color: string
  label?: string
}

const chartColors = [
  '#3b82f6',
  '#8b5cf6',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#14b8a6',
  '#6366f1',
  '#ec4899',
  '#84cc16',
  '#f97316',
  '#22c55e',
  '#0ea5e9',
  '#a855f7',
  '#eab308',
  '#f43f5e',
]

const locationColors = [
  '#2563eb',
  '#0f766e',
  '#7c3aed',
  '#b45309',
  '#be123c',
  '#0891b2',
  '#4d7c0f',
  '#4338ca',
  '#a21caf',
  '#475569',
]

function getSetor(item: DeviceOverviewItem) {
  return item.setor_nome || item.setor || item.alocacao_ativa?.colaborador?.setor_rel?.nome || 'Sem setor'
}

function getLocalidade(item: { localidade_id?: string | null; localidade_nome?: string | null }) {
  const label = typeof item.localidade_nome === 'string' ? item.localidade_nome.trim() : ''
  return label || 'Sem localidade'
}

function buildLocationScopes<T extends { localidade_id?: string | null; localidade_nome?: string | null }>(items: T[]) {
  const map = items.reduce((scopeMap, item) => {
      const id = item.localidade_id ?? '__sem_localidade__'
      const current = scopeMap.get(id) ?? {
        id,
        label: getLocalidade(item),
        total: 0,
      }
      current.total += 1
      if (current.label === 'Sem localidade') current.label = getLocalidade(item)
      scopeMap.set(id, current)
      return scopeMap
    }, new Map<string, { id: string; label: string; total: number }>())

  return Array.from(map.values()).sort((a, b) => b.total - a.total || String(a.label ?? '').localeCompare(String(b.label ?? '')))
}

function filterByLocation<T extends { localidade_id?: string | null }>(items: T[], locationId: string | null) {
  if (!locationId) return items
  if (locationId === '__sem_localidade__') return items.filter(item => !item.localidade_id)
  return items.filter(item => item.localidade_id === locationId)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getTextField(source: unknown, keys: string[]) {
  if (!isRecord(source)) return null

  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }

  const localidade = source.localidade
  if (isRecord(localidade)) {
    for (const key of keys) {
      const value = localidade[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
      if (typeof value === 'number') return String(value)
    }
  }

  return null
}

function getAuditSnapshotText(log: AuditLog, keys: string[]) {
  return getTextField(log.dados_novos, keys) ?? getTextField(log.dados_anteriores, keys)
}

export function getAuditLocalidadeId(log: AuditLog) {
  return getAuditSnapshotText(log, ['localidade_id', 'localidadeId', 'unidade_id', 'unidadeId'])
}

export function getAuditLocalidadeNome(log: AuditLog) {
  return getAuditSnapshotText(log, ['localidade_nome', 'localidadeNome', 'nome', 'unidade_nome', 'unidadeNome'])
}

function getRevisionDate(item: DeviceOverviewItem) {
  return item.data_revisao || item.ultima_revisao || item.created_at || null
}

function isAllocated(item: DeviceOverviewItem) {
  return (item.alocacoes_ativas?.length ?? 0) > 0 || Boolean(item.alocacao_ativa)
}

function isBorrowed(item: DeviceOverviewItem) {
  return item.emprestado === true
}

function isOccupied(item: DeviceOverviewItem) {
  return isAllocated(item) || isBorrowed(item)
}

function hasMissingNotebookData(item: DeviceOverviewItem) {
  return [
    item.modelo,
    item.fabricante,
    item.categoria,
    item.processador,
    item.memoria,
    item.armazenamento,
    item.numero_patrimonio,
    item.data_revisao,
    item.setor_nome,
  ].some(missing)
}

function hasMissingPhoneData(item: DeviceOverviewItem) {
  return [
    item.modelo,
    item.tipo,
    item.endereco_ip,
    item.endereco_mac,
    item.setor_nome,
  ].some(missing)
}

function hasMissingMachineData(item: DeviceOverviewItem) {
  return [
    item.nome_host,
    item.identificador,
    item.fabricante,
    item.modelo,
    item.categoria,
    item.processador,
    item.memoria_ram ?? item.memoria,
    item.armazenamento,
    item.endereco_ip,
    item.patrimonio_cpu,
    item.patrimonio_monitor,
    item.data_revisao,
    item.setor_nome,
  ].some(missing)
}

function isBackupMachine(item: DeviceOverviewItem) {
  return item.categoria === 'Backup'
}

function hasMissingExtensionData(item: DeviceOverviewItem) {
  return [
    item.numero_ramal,
    item.prefixo_telefonico,
    item.senha_acesso,
    item.setor_nome,
  ].some(missing)
}

function hasWhatsapp(item: DeviceOverviewItem) {
  return item.alocacao_ativa?.whatsapp === true || (item.alocacoes_ativas ?? []).some(allocation => allocation.whatsapp === true)
}

function pct(value: number, total: number) {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
}

function getOverviewFilterKey(filter: { kind: string; value?: string }) {
  return `${filter.kind}:${filter.value ?? ''}`
}

function getOverviewTransitionKey(activeFilters?: ActiveOverviewFilterState[], locationId?: string | null) {
  const filterKey = (activeFilters ?? [])
    .map(getOverviewFilterKey)
    .sort()
    .join('|') || 'all'

  return `${locationId ?? 'all-locations'}:${filterKey}`
}

function getFilterColor(filter?: { color?: string; tone?: 'default' | 'success' | 'warning' | 'danger' }) {
  if (filter?.color) return filter.color
  if (filter?.tone === 'success') return '#10b981'
  if (filter?.tone === 'warning') return '#f59e0b'
  if (filter?.tone === 'danger') return '#ef4444'
  return '#3b82f6'
}

function getSectorColor(seed: string) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 9973
  }
  return chartColors[hash % chartColors.length]
}

function getDistinctColor(index: number) {
  const hue = (index * 137.508) % 360
  return `hsl(${hue.toFixed(1)} 84% 52%)`
}

function getLocationColor(index: number) {
  return locationColors[index % locationColors.length]
}

function applyDistinctColors<T extends { label?: string; color?: string }>(items: T[]) {
  const used = new Set<string>()
  return items.map((item, index) => {
    let color = item.color ?? getSectorColor(item.label ?? String(index))
    let attempt = index
    while (used.has(color)) {
      color = getDistinctColor(attempt)
      attempt += 1
    }
    used.add(color)
    return { ...item, color }
  })
}

function buildPieGradient(sectors: PieChartItem[]) {
  let cursor = 0
  const stops = sectors.map((sector) => {
    const start = cursor
    cursor += sector.distribution
    return `${sector.color} ${start}% ${cursor}%`
  })

  return stops.length > 0 ? `conic-gradient(${stops.join(', ')})` : 'conic-gradient(#cbd5e1 0% 100%)'
}

function missing(value: unknown) {
  return value === null || value === undefined || value === ''
}

function daysSince(value?: string | null) {
  if (!value) return null
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return null
  return Math.floor((Date.now() - time) / 86_400_000)
}

function groupByLabel<T>(items: T[], getLabel: (item: T) => string, total: number) {
  const grouped = Array.from(
    items.reduce((map, item) => {
      const label = getLabel(item)
      map.set(label, (map.get(label) ?? 0) + 1)
      return map
    }, new Map<string, number>())
  )
    .map(([label, count]) => ({
      label,
      value: String(count),
      detail: `${pct(count, total)}% do total`,
      color: getSectorColor(label),
      distribution: pct(count, total),
    }))
    .sort((a, b) => Number(b.value) - Number(a.value))

  return applyDistinctColors(grouped)
}

function groupAuditUsers(items: AuditLog[], total: number) {
  const grouped = Array.from(
    items.reduce((map, item) => {
      const key = item.usuario_id || item.usuario_nome || 'Sem responsavel'
      const current = map.get(key)
      if (current) {
        current.count += 1
      } else {
        map.set(key, {
          label: item.usuario_nome || 'Sem responsavel',
          filterValue: item.usuario_id || item.usuario_nome || 'Sem responsavel',
          count: 1,
        })
      }
      return map
    }, new Map<string, { label: string; filterValue: string; count: number }>())
  )
    .map(([, item]) => ({
      label: item.label,
      value: String(item.count),
      detail: `${pct(item.count, total)}% do total`,
      color: getSectorColor(item.filterValue),
      distribution: pct(item.count, total),
      filterValue: item.filterValue,
    }))
    .sort((a, b) => Number(b.value) - Number(a.value))

  return applyDistinctColors(grouped)
}

function latestDate(values: Array<string | null | undefined>) {
  return values
    .filter(Boolean)
    .sort((a, b) => new Date(String(b)).getTime() - new Date(String(a)).getTime())[0]
}

function OverviewShell({
  title,
  accentClassName,
  icon,
  metrics,
  chartTitle,
  chartCenter,
  chartCaption,
  chartItems,
  listTitle,
  listItems,
  emptyMessage,
  listSections,
  beforeContent,
  activeFilters,
  onFilter,
  exportConfig,
  isLoading = false,
}: {
  title: string
  accentClassName: string
  icon: ReactNode
  metrics: OverviewMetric[]
  chartTitle?: string
  chartCenter?: string
  chartCaption?: string
  chartItems?: PieChartItem[]
  listTitle?: string
  listItems?: OverviewListItem[]
  emptyMessage?: string
  listSections?: OverviewListSection[]
  beforeContent?: ReactNode
  activeFilters?: ActiveOverviewFilterState[]
  onFilter?: (filter: OverviewFilter) => void
  exportConfig?: OverviewExportConfig<any>
  isLoading?: boolean
}) {
  const sections: OverviewListSection[] = listSections ?? [{
    title: listTitle ?? '',
    icon: <Activity className="h-3.5 w-3.5" />,
    items: listItems ?? [],
    emptyMessage: emptyMessage ?? 'Sem dados para compor este painel.',
  }]
  const activeFilterKeys = new Set((activeFilters ?? []).map(getOverviewFilterKey))
  const transitionKey = getOverviewTransitionKey(activeFilters)

  return (
    <section className="mb-5 rounded-xl border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Overview geral</p>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {exportConfig && <OverviewExportMenu config={exportConfig} />}
          <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg text-white', accentClassName)}>
            {icon}
          </span>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
      {isLoading ? (
        <motion.div
          key="overview-loading"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        >
          <OverviewLoading accentClassName={accentClassName} />
        </motion.div>
      ) : (
        <motion.div
          key={transitionKey}
          className="space-y-4"
          initial={{ opacity: 0, y: 10, filter: 'blur(2px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -8, filter: 'blur(2px)' }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          {beforeContent}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {metrics.map(metric => (
              <Metric
                key={metric.label}
                {...metric}
                isSelected={metric.filter ? activeFilterKeys.has(getOverviewFilterKey(metric.filter)) : false}
                onFilter={onFilter}
              />
            ))}
          </div>

          <div className={cn('grid gap-3', chartItems?.length ? 'lg:grid-cols-[360px_minmax(0,1fr)]' : 'lg:grid-cols-1')}>
            {chartItems?.length ? (
              <div className="flex flex-col rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                <SectionTitle icon={<MapPin className="h-3.5 w-3.5" />} label={chartTitle ?? 'Distribuição'} />
                <div className="mt-4 flex flex-1 items-center justify-center">
                  <div
                    className="relative h-44 w-44 rounded-full"
                    style={{ background: buildPieGradient(chartItems) }}
                    aria-label={chartTitle ?? 'Distribuição'}
                  >
                    <div className="absolute inset-8 flex flex-col items-center justify-center rounded-full bg-white text-center dark:bg-slate-900">
                      <span className="text-xl font-bold text-slate-900 dark:text-white">{chartCenter}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{chartCaption}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 xl:grid-cols-2">
              {sections.map((section) => (
                <div
                  key={section.title}
                  className={cn(
                    'rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40',
                    section.layout !== 'half' && 'xl:col-span-2'
                  )}
                >
                  <SectionTitle icon={section.icon ?? <Activity className="h-3.5 w-3.5" />} label={section.title} />
                  {section.items.length > 0 ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {section.items.map((item) => (
                        <OverviewListCard
                          key={item.label}
                          item={item}
                          isSelected={item.filter ? activeFilterKeys.has(getOverviewFilterKey(item.filter)) : false}
                          onFilter={onFilter}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-slate-400">{section.emptyMessage}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </section>
  )
}

function LocationScopeAccordion({
  locations,
  selectedLocationId,
  onSelect,
}: {
  locations: Array<{ id: string; label: string; total: number }>
  selectedLocationId: string | null
  onSelect: (location: { id: string; label: string } | null) => void
}) {
  const [open, setOpen] = useState(false)
  const safeLocations = locations.map((location, index) => ({
    id: location.id ?? `__localidade_${index}`,
    label: location.label || 'Sem localidade',
    total: Number.isFinite(location.total) ? location.total : 0,
    color: getLocationColor(index),
  }))
  const selectedLocation = safeLocations.find(location => location.id === selectedLocationId)
  const allLocationsTotal = safeLocations.reduce((sum, location) => sum + location.total, 0)

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-blue-500" />
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: selectedLocation?.color ?? '#64748b' }}
          />
          <span className="truncate text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
            Unidade: {selectedLocation?.label ?? 'Todas'}
          </span>
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-slate-400 transition', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0, y: -4 }}
          animate={{ opacity: 1, height: 'auto', y: 0 }}
          exit={{ opacity: 0, height: 0, y: -4 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden border-t border-slate-100 dark:border-slate-800"
        >
        <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4">
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={cn(
              'relative rounded-md border border-l-4 px-3 py-2 text-left text-xs transition focus:outline-none focus:ring-2 focus:ring-blue-500',
              !selectedLocationId
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                : 'border-transparent bg-white text-slate-600 hover:bg-blue-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-blue-950/20'
            )}
            style={{ borderLeftColor: '#64748b' }}
          >
            {!selectedLocationId && (
              <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
                x
              </span>
            )}
            <span className="flex items-center gap-2 font-semibold">
              <span className="h-2 w-2 rounded-full bg-slate-500" />
              Todas
            </span>
            <span className="text-slate-400">{allLocationsTotal.toLocaleString('pt-BR')} registros</span>
          </button>
          {safeLocations.map(location => (
            <button
              key={location.id}
              type="button"
              onClick={() => onSelect(location)}
              className={cn(
                'relative rounded-md border border-l-4 px-3 py-2 text-left text-xs transition focus:outline-none focus:ring-2 focus:ring-blue-500',
                selectedLocationId === location.id
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                  : 'border-transparent bg-white text-slate-600 hover:bg-blue-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-blue-950/20'
              )}
              style={{ borderLeftColor: location.color }}
            >
              {selectedLocationId === location.id && (
                <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
                  x
                </span>
              )}
              <span className="flex min-w-0 items-center gap-2 font-semibold">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: location.color }} />
                <span className="truncate">{location.label}</span>
              </span>
              <span className="text-slate-400">{location.total.toLocaleString('pt-BR')} registros</span>
            </button>
          ))}
        </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}

export function DeviceOverviewPanel<T extends DeviceOverviewItem>({
  title,
  total,
  items,
  accentClassName,
  activeFilters = [],
  isLoading = false,
  onFilter,
  exportConfig,
}: DeviceOverviewPanelProps<T>) {
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const locations = buildLocationScopes(items)
  const scopedItems = filterByLocation(items, selectedLocationId)
  const isNotebookOverview = title.toLowerCase() === 'notebooks'
  const isPhoneOverview = title.toLowerCase() === 'aparelhos'
  const isExtensionOverview = title.toLowerCase() === 'ramais'
  const isMachineOverview = title.toLowerCase() === 'máquinas'
  const analyzedTotal = scopedItems.length
  const displayedTotal = selectedLocationId ? analyzedTotal : total || analyzedTotal
  const allocated = scopedItems.filter(isOccupied).length
  const allocationOnly = scopedItems.filter(isAllocated).length
  const borrowed = scopedItems.filter(isBorrowed).length
  const missingData = scopedItems.filter(
    isNotebookOverview
      ? hasMissingNotebookData
      : isPhoneOverview
        ? hasMissingPhoneData
        : isExtensionOverview
          ? hasMissingExtensionData
          : isMachineOverview
            ? hasMissingMachineData
            : () => false
  ).length
  const withChip = scopedItems.filter(item => item.chip === true).length
  const withWhatsapp = scopedItems.filter(hasWhatsapp).length
  const queueExtensions = scopedItems.filter(item => item.fila === true).length
  const backupMachines = isMachineOverview ? scopedItems.filter(isBackupMachine).length : 0
  const free = Math.max(0, analyzedTotal - allocated)
  const occupancy = pct(allocated, analyzedTotal)

  const sectors = Array.from(
    scopedItems.reduce((map, item) => {
      const setor = getSetor(item)
      const current = map.get(setor) ?? { total: 0, allocated: 0 }
      current.total += 1
      if (isOccupied(item)) current.allocated += 1
      map.set(setor, current)
      return map
    }, new Map<string, { total: number; allocated: number }>())
  )
    .map(([setor, value]) => ({
      label: setor,
      setor,
      ...value,
      distribution: pct(value.total, analyzedTotal),
      occupancy: pct(value.allocated, value.total),
      color: getSectorColor(setor),
    }))
    .filter(sector => sector.total > 0)
    .sort((a, b) => b.total - a.total)
  const coloredSectors = applyDistinctColors(sectors)
  const activeFilterKeys = new Set(activeFilters.map(getOverviewFilterKey))
  const transitionKey = getOverviewTransitionKey(activeFilters, selectedLocationId)
  function applyLocationScope(location: { id: string; label: string } | null) {
    setSelectedLocationId(location?.id ?? null)
    onFilter?.({ kind: 'location', value: location?.id, label: location ? `Unidade: ${location.label}` : 'Todas as unidades' })
  }

  const latestScopedRevision = scopedItems
    .map(getRevisionDate)
    .filter(Boolean)
    .sort((a, b) => new Date(String(b)).getTime() - new Date(String(a)).getTime())[0]

  return (
    <section className="mb-5 rounded-xl border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Overview geral</p>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {exportConfig && <OverviewExportMenu config={exportConfig} />}
          <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg text-white', accentClassName)}>
            <Activity className="h-4 w-4" />
          </span>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
      {isLoading ? (
        <motion.div
          key="overview-loading"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        >
          <OverviewLoading accentClassName={accentClassName} />
        </motion.div>
      ) : (
      <motion.div
        key={transitionKey}
        className="space-y-4"
        initial={{ opacity: 0, y: 10, filter: 'blur(2px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -8, filter: 'blur(2px)' }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      >
        <LocationScopeAccordion
          locations={locations}
          selectedLocationId={selectedLocationId}
          onSelect={applyLocationScope}
        />
        <div className={cn('grid grid-cols-2 gap-2', isNotebookOverview ? 'md:grid-cols-3 xl:grid-cols-6' : 'md:grid-cols-5')}>
          <Metric icon={<Layers3 className="h-3.5 w-3.5" />} label="Cadastrados" value={displayedTotal.toLocaleString('pt-BR')} filter={{ kind: 'all' }} onFilter={onFilter} />
          {isNotebookOverview ? (
            <>
              <Metric icon={<Activity className="h-3.5 w-3.5" />} label="Ocupados" value={allocated.toLocaleString('pt-BR')} tone="danger" filter={{ kind: 'notebook-occupied' }} isSelected={activeFilterKeys.has(getOverviewFilterKey({ kind: 'notebook-occupied' }))} onFilter={onFilter} />
              <Metric icon={<Users className="h-3.5 w-3.5" />} label="Alocados" value={allocationOnly.toLocaleString('pt-BR')} tone="warning" filter={{ kind: 'allocated' }} isSelected={activeFilterKeys.has(getOverviewFilterKey({ kind: 'allocated' }))} onFilter={onFilter} />
              <Metric icon={<CalendarClock className="h-3.5 w-3.5" />} label="Emprestados" value={borrowed.toLocaleString('pt-BR')} tone="warning" filter={{ kind: 'notebook-borrowed' }} isSelected={activeFilterKeys.has(getOverviewFilterKey({ kind: 'notebook-borrowed' }))} onFilter={onFilter} />
              <Metric icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Livres" value={free.toLocaleString('pt-BR')} tone="success" filter={{ kind: 'free' }} isSelected={activeFilterKeys.has(getOverviewFilterKey({ kind: 'free' }))} onFilter={onFilter} />
              <Metric
                icon={<CalendarClock className="h-3.5 w-3.5" />}
                label="Última revisão"
                value={latestScopedRevision ? formatDate(String(latestScopedRevision)) : '—'}
              />
            </>
          ) : (
            <>
              <Metric icon={<Activity className="h-3.5 w-3.5" />} label="Ocupados" value={allocated.toLocaleString('pt-BR')} tone="danger" filter={{ kind: 'allocated' }} isSelected={activeFilterKeys.has(getOverviewFilterKey({ kind: 'allocated' }))} onFilter={onFilter} />
              <Metric icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Livres" value={free.toLocaleString('pt-BR')} tone="success" filter={{ kind: 'free' }} isSelected={activeFilterKeys.has(getOverviewFilterKey({ kind: 'free' }))} onFilter={onFilter} />
              <Metric icon={<Users className="h-3.5 w-3.5" />} label="Ocupação" value={`${occupancy}%`} tone={occupancy >= 90 ? 'danger' : occupancy >= 50 ? 'warning' : 'success'} />
              <Metric
                icon={<CalendarClock className="h-3.5 w-3.5" />}
                label="Última revisão"
                value={latestScopedRevision ? formatDate(String(latestScopedRevision)) : '—'}
              />
            </>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="flex flex-col rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
            <SectionTitle icon={<MapPin className="h-3.5 w-3.5" />} label="Setores" />
            <div className="mt-4 flex flex-1 items-center justify-center">
              <div
                className="relative h-44 w-44 rounded-full"
                style={{ background: buildPieGradient(coloredSectors) }}
                aria-label="Distribuição de dispositivos por setor"
              >
                <div className="absolute inset-8 flex flex-col items-center justify-center rounded-full bg-white text-center dark:bg-slate-900">
                  <span className="text-xl font-bold text-slate-900 dark:text-white">{sectors.length}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">setores</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
            <SectionTitle icon={<MapPin className="h-3.5 w-3.5" />} label="Ocupação por setor" />
            {sectors.length > 0 ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {coloredSectors.map(sector => (
                  <OverviewListCard
                    key={sector.setor}
                    onFilter={onFilter}
                    isSelected={activeFilterKeys.has(getOverviewFilterKey({ kind: 'sector', value: sector.setor }))}
                    item={{
                      label: sector.setor,
                      value: `${sector.occupancy}%`,
                      detail: `${sector.allocated}/${sector.total} ocupados · ${sector.distribution}% do total`,
                      color: sector.color,
                      filter: { kind: 'sector', value: sector.setor },
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-400">Sem dados para compor setores.</p>
            )}
          </div>
        </div>

        {isNotebookOverview && (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
            <SectionTitle icon={<ShieldAlert className="h-3.5 w-3.5" />} label="Pontos de atencao" />
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <OverviewListCard
                onFilter={onFilter}
                isSelected={activeFilterKeys.has(getOverviewFilterKey({ kind: 'notebook-missing-data' }))}
                item={{
                  label: 'Informacoes faltantes',
                  value: missingData.toLocaleString('pt-BR'),
                  detail: `${pct(missingData, analyzedTotal)}% dos notebooks cadastrados`,
                  tone: missingData > 0 ? 'warning' : 'success',
                  filter: { kind: 'notebook-missing-data' },
                }}
              />
            </div>
          </div>
        )}

        {isPhoneOverview && (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
            <SectionTitle icon={<ShieldAlert className="h-3.5 w-3.5" />} label="Pontos de atencao" />
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <OverviewListCard
                onFilter={onFilter}
                isSelected={activeFilterKeys.has(getOverviewFilterKey({ kind: 'phone-missing-data' }))}
                item={{
                  label: 'Informacoes faltantes',
                  value: missingData.toLocaleString('pt-BR'),
                  detail: `${pct(missingData, analyzedTotal)}% dos aparelhos cadastrados`,
                  tone: missingData > 0 ? 'warning' : 'success',
                  filter: { kind: 'phone-missing-data' },
                }}
              />
              <OverviewListCard
                onFilter={onFilter}
                isSelected={activeFilterKeys.has(getOverviewFilterKey({ kind: 'phone-with-chip' }))}
                item={{
                  label: 'Com chip',
                  value: withChip.toLocaleString('pt-BR'),
                  detail: `${pct(withChip, analyzedTotal)}% dos aparelhos cadastrados`,
                  tone: withChip > 0 ? 'warning' : 'success',
                  filter: { kind: 'phone-with-chip' },
                }}
              />
            </div>
          </div>
        )}

        {isExtensionOverview && (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
            <SectionTitle icon={<ShieldAlert className="h-3.5 w-3.5" />} label="Pontos de atencao" />
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <OverviewListCard
                onFilter={onFilter}
                isSelected={activeFilterKeys.has(getOverviewFilterKey({ kind: 'extension-missing-data' }))}
                item={{
                  label: 'Informacoes faltantes',
                  value: missingData.toLocaleString('pt-BR'),
                  detail: `${pct(missingData, analyzedTotal)}% dos ramais cadastrados`,
                  tone: missingData > 0 ? 'warning' : 'success',
                  filter: { kind: 'extension-missing-data' },
                }}
              />
              <OverviewListCard
                onFilter={onFilter}
                isSelected={activeFilterKeys.has(getOverviewFilterKey({ kind: 'extension-with-whatsapp' }))}
                item={{
                  label: 'Com WhatsApp',
                  value: withWhatsapp.toLocaleString('pt-BR'),
                  detail: `${pct(withWhatsapp, analyzedTotal)}% dos ramais cadastrados`,
                  tone: withWhatsapp > 0 ? 'warning' : 'success',
                  filter: { kind: 'extension-with-whatsapp' },
                }}
              />
              <OverviewListCard
                onFilter={onFilter}
                isSelected={activeFilterKeys.has(getOverviewFilterKey({ kind: 'extension-queue' }))}
                item={{
                  label: 'Ramais de fila',
                  value: queueExtensions.toLocaleString('pt-BR'),
                  detail: `${pct(queueExtensions, analyzedTotal)}% dos ramais cadastrados`,
                  tone: queueExtensions > 0 ? 'warning' : 'success',
                  filter: { kind: 'extension-queue' },
                }}
              />
            </div>
          </div>
        )}

        {isMachineOverview && (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
            <SectionTitle icon={<ShieldAlert className="h-3.5 w-3.5" />} label="Pontos de atencao" />
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <OverviewListCard
                onFilter={onFilter}
                isSelected={activeFilterKeys.has(getOverviewFilterKey({ kind: 'machine-backup' }))}
                item={{
                  label: 'Backups',
                  value: backupMachines.toLocaleString('pt-BR'),
                  detail: `${pct(backupMachines, analyzedTotal)}% das maquinas cadastradas`,
                  tone: backupMachines > 0 ? 'warning' : 'success',
                  filter: { kind: 'machine-backup' },
                }}
              />
              <OverviewListCard
                onFilter={onFilter}
                isSelected={activeFilterKeys.has(getOverviewFilterKey({ kind: 'machine-missing-data' }))}
                item={{
                  label: 'Informacoes faltantes',
                  value: missingData.toLocaleString('pt-BR'),
                  detail: `${pct(missingData, analyzedTotal)}% das maquinas cadastradas`,
                  tone: missingData > 0 ? 'warning' : 'success',
                  filter: { kind: 'machine-missing-data' },
                }}
              />
            </div>
          </div>
        )}
      </motion.div>
      )}
      </AnimatePresence>
    </section>
  )
}

export function ImpressoraOverviewPanel({
  total,
  items,
  activeFilters = [],
  isLoading = false,
  onFilter,
  exportConfig,
}: ImpressoraOverviewPanelProps) {
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const locations = buildLocationScopes(items)
  const scopedItems = filterByLocation(items, selectedLocationId)
  const active = scopedItems.filter(item => item.status !== false).length
  const inactive = scopedItems.filter(item => item.status === false).length
  const stale = scopedItems.filter(item => {
    const days = daysSince(item.revisao)
    return days === null || days > 90
  }).length
  const missingData = scopedItems.filter(item =>
    [item.nome_host, item.fabricante, item.modelo, item.numero_serie, item.endereco_ip].some(missing)
  ).length
  const attention = scopedItems.filter(item => {
    const days = daysSince(item.revisao)
    const hasMissingData = [item.nome_host, item.fabricante, item.modelo, item.numero_serie, item.endereco_ip].some(missing)
    return item.status === false || days === null || days > 90 || hasMissingData
  }).length
  const sectors = groupByLabel(
    scopedItems,
    item => item.setor_id && item.setor_nome ? item.setor_nome : 'Sem setor registrado',
    scopedItems.length
  )
  const noRevision = scopedItems.filter(item => !item.revisao).length
  const noIp = scopedItems.filter(item => missing(item.endereco_ip)).length
  const noSector = scopedItems.filter(item => !item.setor_id || !item.setor_nome).length
  const noIdentity = scopedItems.filter(item => missing(item.nome_host) || missing(item.numero_serie)).length
  const displayedTotal = selectedLocationId ? scopedItems.length : total || scopedItems.length
  function applyLocationScope(location: { id: string; label: string } | null) {
    setSelectedLocationId(location?.id ?? null)
    onFilter?.({ kind: 'location', value: location?.id, label: location ? `Unidade: ${location.label}` : 'Todas as unidades' })
  }

  return (
    <OverviewShell
      title="Impressoras"
      accentClassName="bg-cyan-500"
      icon={<Activity className="h-4 w-4" />}
      beforeContent={
        <LocationScopeAccordion
          locations={locations}
          selectedLocationId={selectedLocationId}
          onSelect={applyLocationScope}
        />
      }
      metrics={[
        { icon: <Layers3 className="h-3.5 w-3.5" />, label: 'Cadastradas', value: displayedTotal.toLocaleString('pt-BR'), filter: { kind: 'all' } },
        { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: 'Ativas', value: active.toLocaleString('pt-BR'), tone: 'success', filter: { kind: 'printer-status', value: 'true' } },
        { icon: <AlertTriangle className="h-3.5 w-3.5" />, label: 'Inativas', value: inactive.toLocaleString('pt-BR'), tone: inactive > 0 ? 'danger' : 'success', filter: { kind: 'printer-status', value: 'false' } },
        { icon: <CalendarClock className="h-3.5 w-3.5" />, label: 'Revisao 3 meses', value: stale.toLocaleString('pt-BR'), tone: stale > 0 ? 'warning' : 'success', filter: { kind: 'printer-stale' } },
        { icon: <ShieldAlert className="h-3.5 w-3.5" />, label: 'Atencao', value: attention.toLocaleString('pt-BR'), tone: attention > 0 ? 'danger' : 'success', filter: { kind: 'printer-attention' } },
      ]}
      chartTitle="Setores"
      chartCenter={sectors.length.toLocaleString('pt-BR')}
      chartCaption="setores"
      chartItems={sectors}
      listSections={[
        {
          title: 'Impressoras por setor',
          icon: <MapPin className="h-3.5 w-3.5" />,
          items: sectors.map(item => ({
            ...item,
            detail: `${item.detail} · ${item.value} impressoras`,
            filter: { kind: 'printer-sector', value: item.label },
          })),
          emptyMessage: 'Sem dados para compor setores.',
        },
        {
          title: 'Pontos de atencao',
          icon: <ShieldAlert className="h-3.5 w-3.5" />,
          items: [
            { label: 'Sem revisao em 3 meses', value: String(stale), detail: 'inclui sem data de revisao', tone: stale > 0 ? 'warning' : 'success', filter: { kind: 'printer-stale' } },
            { label: 'Sem revisao registrada', value: String(noRevision), detail: 'campo de revisao vazio', tone: noRevision > 0 ? 'warning' : 'success', filter: { kind: 'printer-no-revision' } },
            { label: 'Dados faltantes', value: String(missingData), detail: 'campos essenciais incompletos', tone: missingData > 0 ? 'warning' : 'success', filter: { kind: 'printer-missing-data' } },
            { label: 'Sem IP', value: String(noIp), detail: 'endereco de rede ausente', tone: noIp > 0 ? 'warning' : 'success', filter: { kind: 'printer-no-ip' } },
            { label: 'Sem setor registrado', value: String(noSector), detail: 'setor ausente no cadastro', tone: noSector > 0 ? 'warning' : 'success', filter: { kind: 'printer-no-sector' } },
            { label: 'Sem identificacao', value: String(noIdentity), detail: 'host ou serie ausentes', tone: noIdentity > 0 ? 'warning' : 'success', filter: { kind: 'printer-no-identity' } },
            { label: 'Inativas', value: String(inactive), detail: `${pct(inactive, scopedItems.length)}% do parque`, tone: inactive > 0 ? 'danger' : 'success', filter: { kind: 'printer-status', value: 'false' } },
          ],
          emptyMessage: 'Nenhum ponto de atencao encontrado.',
        },
      ]}
      activeFilters={activeFilters}
      onFilter={onFilter}
      exportConfig={exportConfig}
      isLoading={isLoading}
    />
  )
}

export function RackOverviewPanel({ total, items, activeFilters = [], isLoading = false, onFilter, exportConfig }: RackOverviewPanelProps) {
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const locationScopes = buildLocationScopes(items)
  const scopedItems = filterByLocation(items, selectedLocationId)
  const totalPorts = scopedItems.reduce((sum, item) => sum + (item.quantidade_portas ?? 0), 0)
  const usedPorts = scopedItems.reduce((sum, item) => sum + (item.portas_em_uso ?? 0), 0)
  const displayedTotal = selectedLocationId ? scopedItems.length : total || scopedItems.length
  const occupancy = pct(usedPorts, totalPorts)
  const critical = scopedItems.filter(item => {
    if (!item.quantidade_portas || item.portas_em_uso === null || item.portas_em_uso === undefined) return true
    return pct(item.portas_em_uso, item.quantidade_portas) >= 85
  })
  const locations = groupByLabel(scopedItems, item => item.localizacao || 'Sem localizacao', scopedItems.length)
  const missingPorts = scopedItems.filter(item => !item.quantidade_portas).length
  const missingUsedPorts = scopedItems.filter(item => item.portas_em_uso === null || item.portas_em_uso === undefined).length
  const criticalList = critical
    .map(item => {
      const rackOccupancy = pct(item.portas_em_uso ?? 0, item.quantidade_portas ?? 0)
      return {
        label: item.nome_switch || item.localizacao || 'Rack sem nome',
        value: item.quantidade_portas ? `${rackOccupancy}%` : '—',
        detail: item.quantidade_portas
          ? `${item.portas_em_uso ?? 0}/${item.quantidade_portas} portas em uso`
          : 'ocupacao sem base completa',
        tone: rackOccupancy >= 95 || !item.quantidade_portas ? 'danger' as const : 'warning' as const,
        filter: { kind: 'rack-id', value: item.id },
      }
    })
    .sort((a, b) => Number.parseInt(b.value) - Number.parseInt(a.value))
    .slice(0, 6)
  function applyLocationScope(location: { id: string; label: string } | null) {
    setSelectedLocationId(location?.id ?? null)
    onFilter?.({ kind: 'location', value: location?.id, label: location ? `Unidade: ${location.label}` : 'Todas as unidades' })
  }

  return (
    <OverviewShell
      title="Racks"
      accentClassName="bg-violet-500"
      icon={<Activity className="h-4 w-4" />}
      beforeContent={
        <LocationScopeAccordion
          locations={locationScopes}
          selectedLocationId={selectedLocationId}
          onSelect={applyLocationScope}
        />
      }
      metrics={[
        { icon: <Layers3 className="h-3.5 w-3.5" />, label: 'Cadastrados', value: displayedTotal.toLocaleString('pt-BR'), filter: { kind: 'all' } },
        { icon: <Activity className="h-3.5 w-3.5" />, label: 'Portas em uso', value: usedPorts.toLocaleString('pt-BR'), tone: occupancy >= 85 ? 'danger' : 'default' },
        { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: 'Portas livres', value: Math.max(0, totalPorts - usedPorts).toLocaleString('pt-BR'), tone: 'success' },
        { icon: <Users className="h-3.5 w-3.5" />, label: 'Ocupacao', value: `${occupancy}%`, tone: occupancy >= 85 ? 'danger' : occupancy >= 65 ? 'warning' : 'success' },
        { icon: <ShieldAlert className="h-3.5 w-3.5" />, label: 'Criticos', value: critical.length.toLocaleString('pt-BR'), tone: critical.length > 0 ? 'danger' : 'success' },
      ]}
      chartTitle="Localizacoes"
      chartCenter={locations.length.toLocaleString('pt-BR')}
      chartCaption="locais"
      chartItems={locations}
      listSections={[
        {
          title: 'Racks por setor',
          icon: <MapPin className="h-3.5 w-3.5" />,
          items: locations.map(item => ({ ...item, detail: `${item.detail} · racks`, filter: { kind: 'rack-location', value: item.label } })),
          emptyMessage: 'Sem dados para compor setores.',
        },
        {
          title: 'Pontos de atencao',
          icon: <ShieldAlert className="h-3.5 w-3.5" />,
          items: [
            { label: 'Ocupacao critica', value: String(critical.length), detail: 'racks acima de 85% ou sem base', tone: critical.length > 0 ? 'danger' : 'success', filter: { kind: 'rack-critical' } },
            { label: 'Sem total de portas', value: String(missingPorts), detail: 'capacidade nao informada', tone: missingPorts > 0 ? 'warning' : 'success', filter: { kind: 'rack-missing-ports' } },
            { label: 'Sem uso informado', value: String(missingUsedPorts), detail: 'portas em uso ausentes', tone: missingUsedPorts > 0 ? 'warning' : 'success', filter: { kind: 'rack-missing-used' } },
            ...criticalList,
          ],
          emptyMessage: 'Nenhum rack proximo da ocupacao maxima.',
        },
      ]}
      activeFilters={activeFilters}
      onFilter={onFilter}
      exportConfig={exportConfig}
      isLoading={isLoading}
    />
  )
}

export function ColaboradorOverviewPanel({
  total,
  items,
  metricTotal = total,
  metricItems = items,
  activeFilters = [],
  isLoading = false,
  onFilter,
  exportConfig,
}: ColaboradorOverviewPanelProps) {
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const locations = buildLocationScopes(items)
  const scopedItems = filterByLocation(items, selectedLocationId)
  const scopedMetricItems = filterByLocation(metricItems, selectedLocationId)
  const activeItems = scopedItems.filter(item => item.status === 'Ativo')
  const metricActiveItems = scopedMetricItems.filter(item => item.status === 'Ativo')
  const active = metricActiveItems.length
  const sectors = groupByLabel(scopedItems, item => item.setor_nome ?? 'Sem setor', scopedItems.length)
  const metricSectors = groupByLabel(scopedMetricItems, item => item.setor_nome ?? 'Sem setor', scopedMetricItems.length)
  const withoutMachine = activeItems.filter(item => !item.alocacoes_maquinas_ativas).length
  const withoutNotebook = activeItems.filter(item => !item.alocacoes_notebooks_ativas).length
  const withoutPhone = activeItems.filter(item => !item.alocacoes_aparelhos_ativas).length
  const withoutExtension = activeItems.filter(item => !item.alocacoes_ramais_ativas).length
  const metricWithoutAny = metricActiveItems.filter(item =>
    !item.alocacoes_maquinas_ativas &&
    !item.alocacoes_notebooks_ativas &&
    !item.alocacoes_aparelhos_ativas &&
    !item.alocacoes_ramais_ativas
  ).length
  const displayedMetricTotal = selectedLocationId ? scopedMetricItems.length : metricTotal || scopedMetricItems.length
  function applyLocationScope(location: { id: string; label: string } | null) {
    setSelectedLocationId(location?.id ?? null)
    onFilter?.({ kind: 'location', value: location?.id, label: location ? `Unidade: ${location.label}` : 'Todas as unidades' })
  }

  return (
    <OverviewShell
      title="Colaboradores"
      accentClassName="bg-emerald-500"
      icon={<Users className="h-4 w-4" />}
      beforeContent={
        <LocationScopeAccordion
          locations={locations}
          selectedLocationId={selectedLocationId}
          onSelect={applyLocationScope}
        />
      }
      metrics={[
        { icon: <Users className="h-3.5 w-3.5" />, label: 'Em registro', value: displayedMetricTotal.toLocaleString('pt-BR'), filter: { kind: 'all' } },
        { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: 'Ativos', value: active.toLocaleString('pt-BR'), tone: 'success', filter: { kind: 'collaborator-status', value: 'Ativo' } },
        { icon: <MapPin className="h-3.5 w-3.5" />, label: 'Setores', value: metricSectors.length.toLocaleString('pt-BR') },
        { icon: <AlertTriangle className="h-3.5 w-3.5" />, label: 'Sem alocacao', value: metricWithoutAny.toLocaleString('pt-BR'), tone: metricWithoutAny > 0 ? 'warning' : 'success', filter: { kind: 'collaborator-without-any' } },
        { icon: <Activity className="h-3.5 w-3.5" />, label: 'Cobertura', value: `${pct(active - metricWithoutAny, active)}%`, tone: metricWithoutAny > 0 ? 'warning' : 'success' },
      ]}
      chartTitle="Setores"
      chartCenter={sectors.length.toLocaleString('pt-BR')}
      chartCaption="setores"
      chartItems={sectors}
      listSections={[
        {
          title: 'Colaboradores por setor',
          icon: <MapPin className="h-3.5 w-3.5" />,
          items: sectors.map(item => ({ ...item, detail: `${item.detail} · colaboradores`, filter: { kind: 'collaborator-sector', value: item.label } })),
          emptyMessage: 'Sem dados para compor setores.',
        },
        {
          title: 'Ausencias por tipo',
          icon: <Activity className="h-3.5 w-3.5" />,
          items: [
            { label: 'Sem maquina', value: String(withoutMachine), detail: `${pct(withoutMachine, activeItems.length)}% dos colaboradores ativos`, tone: withoutMachine > 0 ? 'warning' : 'success', filter: { kind: 'collaborator-without-machine' } },
            { label: 'Sem notebook', value: String(withoutNotebook), detail: `${pct(withoutNotebook, activeItems.length)}% dos colaboradores ativos`, tone: withoutNotebook > 0 ? 'warning' : 'success', filter: { kind: 'collaborator-without-notebook' } },
            { label: 'Sem telefone', value: String(withoutPhone), detail: `${pct(withoutPhone, activeItems.length)}% dos colaboradores ativos`, tone: withoutPhone > 0 ? 'warning' : 'success', filter: { kind: 'collaborator-without-phone' } },
            { label: 'Sem ramal', value: String(withoutExtension), detail: `${pct(withoutExtension, activeItems.length)}% dos colaboradores ativos`, tone: withoutExtension > 0 ? 'warning' : 'success', filter: { kind: 'collaborator-without-extension' } },
          ],
          emptyMessage: 'Sem ausencias por tipo.',
        },
      ]}
      activeFilters={activeFilters}
      onFilter={onFilter}
      exportConfig={exportConfig}
      isLoading={isLoading}
    />
  )
}

export function notifyOverviewFilter(filters: ActiveOverviewFilterState[]) {
  const toastId = 'overview-filter-toast'
  const activeFilters = filters.filter(filter => filter.kind !== 'all')
  const title = activeFilters.length === 0
    ? 'Overview em visão geral'
    : activeFilters.length === 1
      ? `Overview focado em ${activeFilters[0].label ?? 'recorte selecionado'}`
      : `Overview com ${activeFilters.length} filtros ativos`
  const detail = activeFilters.length === 0
    ? 'Tabela exibindo todos os registros.'
    : activeFilters.length === 1
      ? 'Tabela filtrada pelo recorte selecionado no overview.'
      : `Tabela filtrada por ${activeFilters.map(filter => filter.label ?? 'recorte').join(', ')}.`
  const colors = activeFilters.length > 0
    ? activeFilters.map(getFilterColor)
    : ['#3b82f6']

  toast.custom((id) => (
    <div className="flex w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-950">
      <span className="flex w-1.5 shrink-0 flex-col">
        {colors.map((color, index) => (
          <span
            key={`${color}-${index}`}
            className="min-h-1 flex-1"
            style={{ backgroundColor: color }}
          />
        ))}
      </span>
      <div className="min-w-0 flex-1 px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
          </div>
          <button
            type="button"
            onClick={() => toast.dismiss(id)}
            className="rounded-md px-1.5 text-sm text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Fechar notificação"
          >
            x
          </button>
        </div>
      </div>
    </div>
  ), { id: toastId })
}

export function AuditOverviewPanel({ total, items, activeFilters, isLoading = false, onFilter, exportConfig }: AuditOverviewPanelProps) {
  const scopedItems = items
  const analyzedTotal = scopedItems.length
  const displayedTotal = total || analyzedTotal
  const edits = scopedItems.filter(item => item.acao === 'UPDATE' || item.acao === 'EDITAR_ALOCACAO')
  const deletes = scopedItems.filter(item => item.acao === 'DELETE')
  const forumItems = scopedItems.filter(item => item.tabela.startsWith('forum_'))
  const requestItems = scopedItems.filter(item => item.tabela === 'solicitacoes_inventario')
  const inventoryItems = scopedItems.filter(item => !item.tabela.startsWith('forum_') && item.tabela !== 'solicitacoes_inventario')
  const latest = latestDate(edits.map(item => item.created_at)) ?? latestDate(scopedItems.map(item => item.created_at))
  const users = groupAuditUsers(edits, edits.length)
  const inventoryActions = groupByLabel(inventoryItems, item => ACAO_LABELS[item.acao] || item.acao || 'Sem acao', inventoryItems.length)
  const forumActions = groupByLabel(forumItems, item => ACAO_LABELS[item.acao] || item.acao || 'Sem acao', forumItems.length)
  const requestActions = groupByLabel(requestItems, item => ACAO_LABELS[item.acao] || item.acao || 'Sem acao', requestItems.length)
  const latestLabel = latest ? formatDate(String(latest)) : '—'

  return (
    <OverviewShell
      title="Auditoria"
      accentClassName="bg-amber-500"
      icon={<ShieldAlert className="h-4 w-4" />}
      metrics={[
        { icon: <Layers3 className="h-3.5 w-3.5" />, label: 'Registros', value: displayedTotal.toLocaleString('pt-BR'), filter: { kind: 'all' } },
        { icon: <Activity className="h-3.5 w-3.5" />, label: 'Edicoes', value: edits.length.toLocaleString('pt-BR'), tone: 'warning', filter: { kind: 'audit-edits' } },
        { icon: <Activity className="h-3.5 w-3.5" />, label: 'Inventário', value: inventoryItems.length.toLocaleString('pt-BR'), tone: 'default', filter: { kind: 'audit-inventory', value: 'inventory', label: 'Inventário' } },
        { icon: <MessageSquare className="h-3.5 w-3.5" />, label: 'Fórum', value: forumItems.length.toLocaleString('pt-BR'), tone: 'default', filter: { kind: 'audit-forum', value: 'forum', label: 'Fórum' } },
        { icon: <GitPullRequest className="h-3.5 w-3.5" />, label: 'Pedidos', value: requestItems.length.toLocaleString('pt-BR'), tone: 'default', filter: { kind: 'audit-inventory-requests', value: 'solicitacoes_inventario', label: 'Pedidos de inventário' } },
        { icon: <Users className="h-3.5 w-3.5" />, label: 'Responsaveis', value: users.length.toLocaleString('pt-BR') },
        { icon: <CalendarClock className="h-3.5 w-3.5" />, label: 'Ultima edicao', value: latestLabel },
        { icon: <ShieldAlert className="h-3.5 w-3.5" />, label: 'Exclusoes', value: deletes.length.toLocaleString('pt-BR'), tone: deletes.length > 0 ? 'danger' : 'success', filter: { kind: 'audit-action', value: 'DELETE' } },
      ]}
      listSections={[
        {
          title: 'Edicoes por responsavel',
          icon: <Users className="h-3.5 w-3.5" />,
          items: users.map(item => ({
            ...item,
            detail: `${item.detail} · edicoes`,
            filter: { kind: 'audit-user', value: item.filterValue, label: `Responsavel: ${item.label}`, color: item.color },
          })),
          emptyMessage: 'Sem edicoes por responsavel.',
        },
        {
          title: 'Acoes inventario',
          icon: <Activity className="h-3.5 w-3.5" />,
          items: inventoryActions.map(item => ({
            ...item,
            detail: `${item.detail} · ocorrencias`,
            filter: { kind: 'audit-inventory-action-label', value: item.label, label: `Inventário: ${item.label}` },
          })),
          emptyMessage: 'Sem ações do inventário registradas.',
          layout: 'half',
        },
        {
          title: 'Acoes forum',
          icon: <MessageSquare className="h-3.5 w-3.5" />,
          items: forumActions.map(item => ({
            ...item,
            detail: `${item.detail} · ocorrencias`,
            filter: { kind: 'audit-forum-action-label', value: item.label, label: `Fórum: ${item.label}`, color: item.color },
          })),
          emptyMessage: 'Sem ações do fórum registradas.',
          layout: 'half',
        },
        {
          title: 'Pedidos inventario',
          icon: <GitPullRequest className="h-3.5 w-3.5" />,
          items: requestActions.map(item => ({
            ...item,
            detail: `${item.detail} · pedidos`,
            filter: { kind: 'audit-inventory-request-action-label', value: item.label, label: `Pedidos: ${item.label}`, color: item.color },
          })),
          emptyMessage: 'Sem pedidos de inventário registrados.',
          layout: 'half',
        },
        {
          title: 'Pontos de cuidado',
          icon: <ShieldAlert className="h-3.5 w-3.5" />,
          items: [
            { label: 'Exclusoes registradas', value: String(deletes.length), detail: `${pct(deletes.length, analyzedTotal)}% dos registros`, tone: deletes.length > 0 ? 'danger' : 'success', filter: { kind: 'audit-action', value: 'DELETE' } },
          ],
          emptyMessage: 'Sem pontos de cuidado.',
          layout: 'half',
        },
      ]}
      onFilter={onFilter}
      activeFilters={activeFilters}
      exportConfig={exportConfig}
      isLoading={isLoading}
    />
  )
}

function OverviewLoading({ accentClassName }: { accentClassName: string }) {
  return (
    <div className="space-y-4" aria-label="Carregando overview">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
            <div className="mb-3 flex items-center gap-2">
              <span className={cn('h-3.5 w-3.5 rounded-full animate-pulse', accentClassName)} />
              <div className="h-3 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            </div>
            <div className="h-6 w-14 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="mb-4 h-3 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          <div className="flex h-44 items-center justify-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-slate-200 border-t-blue-500 dark:border-slate-800 dark:border-t-blue-400 animate-spin" />
          </div>
        </div>

        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="mb-4 h-3 w-36 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="rounded-md bg-white px-3 py-2 dark:bg-slate-900">
                <div className="mb-2 flex items-center gap-2">
                  <span className={cn('h-2.5 w-2.5 rounded-full animate-pulse', accentClassName)} />
                  <div className="h-3 w-28 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                </div>
                <div className="h-3 w-36 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
      {icon}
      <span>{label}</span>
    </div>
  )
}

function Metric({
  icon,
  label,
  value,
  tone = 'default',
  filter,
  isSelected = false,
  onFilter,
}: {
  icon: ReactNode
  label: string
  value: string
  tone?: 'default' | 'success' | 'warning' | 'danger'
  filter?: OverviewFilter
  isSelected?: boolean
  onFilter?: (filter: OverviewFilter) => void
}) {
  const toneClassName = {
    default: 'text-slate-700 dark:text-slate-200',
    success: 'text-emerald-600 dark:text-emerald-300',
    warning: 'text-amber-600 dark:text-amber-300',
    danger: 'text-red-600 dark:text-red-300',
  }[tone]

  const Component = filter && onFilter ? 'button' : 'div'
  const selectionColor = getFilterColor({ color: filter?.color, tone })

  return (
    <Component
      type={Component === 'button' ? 'button' : undefined}
      onClick={filter && onFilter ? () => onFilter({ ...filter, label, tone }) : undefined}
      className={cn(
        'relative w-full rounded-lg border bg-slate-50 p-3 text-left dark:bg-slate-950/40',
        isSelected ? 'border-transparent ring-2' : 'border-slate-100 dark:border-slate-800',
        filter && onFilter && 'transition hover:border-blue-300 hover:bg-blue-50/50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:border-blue-700 dark:hover:bg-blue-950/20'
      )}
      style={isSelected ? { '--tw-ring-color': selectionColor } as CSSProperties : undefined}
    >
      {isSelected && (
        <span
          className="pointer-events-none absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ backgroundColor: selectionColor }}
        >
          x
        </span>
      )}
      <div className="mb-2 flex items-center gap-1.5 text-slate-400">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={cn('text-lg font-bold tabular-nums', toneClassName)}>{value}</p>
    </Component>
  )
}

function OverviewListCard({
  item,
  isSelected = false,
  onFilter,
}: {
  item: OverviewListItem
  isSelected?: boolean
  onFilter?: (filter: OverviewFilter) => void
}) {
  const toneClassName = {
    default: 'text-slate-400',
    success: 'text-emerald-600 dark:text-emerald-300',
    warning: 'text-amber-600 dark:text-amber-300',
    danger: 'text-red-600 dark:text-red-300',
  }[item.tone ?? 'default']

  const Component = item.filter && onFilter ? 'button' : 'div'
  const selectionColor = getFilterColor({ color: item.color, tone: item.tone })

  return (
    <Component
      type={Component === 'button' ? 'button' : undefined}
      onClick={item.filter && onFilter
        ? () => onFilter({
            ...(item.filter as OverviewFilter),
            label: item.label,
            color: item.color,
            tone: item.tone,
          })
        : undefined}
      className={cn(
        'relative w-full rounded-md border bg-white px-3 py-2 text-left dark:bg-slate-900',
        isSelected ? 'border-transparent ring-2' : 'border-transparent',
        item.filter && onFilter && 'transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-blue-950/20'
      )}
      style={isSelected ? { '--tw-ring-color': selectionColor } as CSSProperties : undefined}
    >
      {isSelected && (
        <span
          className="pointer-events-none absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ backgroundColor: selectionColor }}
        >
          x
        </span>
      )}
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200">
          <span
            className={cn('h-2.5 w-2.5 shrink-0 rounded-full', item.color ? '' : 'bg-slate-300 dark:bg-slate-700')}
            style={item.color ? { backgroundColor: item.color } : undefined}
          />
          <span className="truncate">{item.label}</span>
        </span>
        <span className={cn('text-xs font-semibold tabular-nums', toneClassName)}>{item.value}</span>
      </div>
      {item.detail && <p className="text-[11px] text-slate-400">{item.detail}</p>}
    </Component>
  )
}

export function OverviewFilterToastDescription({
  label,
  filter,
}: {
  label: string
  filter: OverviewFilter
}) {
  const toneClassName = {
    default: 'bg-slate-400',
    success: 'bg-emerald-400',
    warning: 'bg-amber-400',
    danger: 'bg-red-400',
  }[filter.tone ?? 'default']

  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn('h-2.5 w-2.5 rounded-full', filter.color ? '' : toneClassName)}
        style={filter.color ? { backgroundColor: filter.color } : undefined}
      />
      <span>{label}</span>
    </span>
  )
}
