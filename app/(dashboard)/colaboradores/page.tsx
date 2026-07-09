'use client'
import { usePermission } from '@/hooks/use-permission'

import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence } from 'motion/react'
import { useSearchParams } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/tables/data-table'
import { ColaboradorOverviewPanel, type OverviewFilter, notifyOverviewFilter } from '@/components/tables/device-overview-panel'
import type { OverviewExportConfig } from '@/components/tables/overview-export-menu'
import { PageHeader } from '@/components/layout/page-header'
import { INVENTORY_MOBILE_VIEWS, MobileSectionNav, type InventoryMobileView } from '@/components/layout/mobile-section-nav'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { ColaboradorModal } from '@/components/modals/colaborador-modal'
import { SetorSelect } from '@/components/modals/setor-select'
import { LocalidadeSelect } from '@/components/modals/localidade-select'
import { Plus, Search } from 'lucide-react'
import type { Colaborador, PaginatedResponse } from '@/types'
import { CriarColaboradorModal } from '@/components/modals/criar-colaborador-modal'
import { useInspectNavigation } from '@/hooks/use-inspect-navigation'

type ActiveOverviewFilter = OverviewFilter & {
  key: string
  predicate: (item: Colaborador) => boolean
}

const columns: ColumnDef<Colaborador>[] = [
  { accessorKey: 'codigo', header: 'Código', cell: ({ getValue }) => getValue() || '—', enableSorting: true},
  { accessorKey: 'nome', enableSorting: true, header: 'Nome', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
  {
    accessorKey: 'setor',
    header: 'Setor',
    enableSorting: false,
    cell: ({ row }) => row.original.setor_nome ?? '—',
  },
  {
    accessorKey: 'localidade_nome',
    header: 'Localidade',
    cell: ({ row }) => row.original.localidade_nome ?? '—',
  },
  {
    accessorKey: 'status', header: 'Status', enableSorting: false,
    cell: ({ getValue }) => <StatusBadge status={getValue() as string} />,
  },
]

export default function ColaboradoresPage() {
  const searchParams = useSearchParams()
  const inspectId = searchParams.get('inspect')
  const { isAdmin, canRequestInventoryChanges } = usePermission()
  const [data, setData] = useState<Colaborador[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [overviewData, setOverviewData] = useState<Colaborador[]>([])
  const [overviewTotal, setOverviewTotal] = useState(0)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Colaborador | null>(null)
  const [showCriar, setShowCriar] = useState(false)
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [setorIdFiltro, setSetorIdFiltro] = useState<string | null>(searchParams.get('setor_id'))
  const [localidadeIdFiltro, setLocalidadeIdFiltro] = useState<string | null>(searchParams.get('localidade_id'))
  const [status, setStatus] = useState(searchParams.get('status') || '')
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeOverviewFilters, setActiveOverviewFilters] = useState<ActiveOverviewFilter[]>([])
  const [overviewFilterLoading, setOverviewFilterLoading] = useState(false)
  const [mobileView, setMobileView] = useState<InventoryMobileView>('registros')

  const [sort, setSort] = useState('nome')
  const [dir, setDir]   = useState<'asc' | 'desc'>('asc')
  const { openInspect, closeInspect } = useInspectNavigation<Colaborador>(setSelected)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: '20' })
    if (search) params.set('search', search)
    if (setorIdFiltro) params.set('setor_id', setorIdFiltro)
    if (localidadeIdFiltro) params.set('localidade_id', localidadeIdFiltro)
    if (status) params.set('status', status)
    if (sort) params.set('sort', sort)
    if (dir) params.set('dir', dir)
    const res = await fetch(`/api/colaboradores?${params}`)
    const json: PaginatedResponse<Colaborador> = await res.json()
    setData(json.data)
    setTotal(json.total)
    setTotalPages(json.totalPages)
    setLoading(false)
  }, [page, search, setorIdFiltro, localidadeIdFiltro, status, sort, dir])

  useEffect(() => { void Promise.resolve().then(fetchData) }, [fetchData, refreshKey])

  useEffect(() => {
    if (!inspectId) return
    const found = data.find(item => item.id === inspectId) ?? overviewData.find(item => item.id === inspectId)
    if (!found) return

    const timeout = window.setTimeout(() => setSelected(found), 0)
    return () => window.clearTimeout(timeout)
  }, [inspectId, data, overviewData])

  useEffect(() => {
    if (!inspectId) return
    let cancelled = false

    fetch(`/api/colaboradores/${inspectId}`)
      .then(res => res.ok ? res.json() : null)
      .then((item: Colaborador | null) => {
        if (!cancelled && item) setSelected(item)
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [inspectId])

  const filteredOverviewData = activeOverviewFilters.length > 0
    ? overviewData.filter(item => matchesOverviewFilters(item, activeOverviewFilters))
    : null
  const activeSectorFilters = activeOverviewFilters.filter(filter => filter.kind === 'collaborator-sector')
  const selectedSectorOverviewData = activeSectorFilters.length > 0
    ? overviewData.filter(item => activeSectorFilters.some(filter => filter.predicate(item)))
    : null
  const metricOverviewData = selectedSectorOverviewData ?? overviewData
  const metricOverviewTotal = selectedSectorOverviewData ? selectedSectorOverviewData.length : overviewTotal || total
  const overviewPanelData = filteredOverviewData ?? overviewData
  const overviewPanelTotal = filteredOverviewData?.length ?? (overviewTotal || total)
  const overviewMetricData = filteredOverviewData ?? metricOverviewData
  const overviewMetricTotal = filteredOverviewData?.length ?? metricOverviewTotal
  const overviewExportConfig: OverviewExportConfig<Colaborador> = {
    title: 'Overview de Colaboradores',
    filename: 'overview-colaboradores',
    rows: overviewPanelData,
    activeFilters: activeOverviewFilters,
    columns: [
      { key: 'codigo', header: 'Código', value: item => item.codigo },
      { key: 'nome', header: 'Nome', value: item => item.nome },
      { key: 'status', header: 'Status', value: item => item.status },
      { key: 'setor', header: 'Setor', value: item => getColaboradorSetor(item) },
      { key: 'localidade', header: 'Localidade', value: item => item.localidade_nome },
      { key: 'maquinas', header: 'Máquinas ativas', value: item => item.alocacoes_maquinas_ativas ?? 0 },
      { key: 'notebooks', header: 'Notebooks ativos', value: item => item.alocacoes_notebooks_ativas ?? 0 },
      { key: 'aparelhos', header: 'Aparelhos ativos', value: item => item.alocacoes_aparelhos_ativas ?? 0 },
      { key: 'ramais', header: 'Ramais ativos', value: item => item.alocacoes_ramais_ativas ?? 0 },
      { key: 'sem_alocacao', header: 'Sem alocação', value: item => item.status === 'Ativo' && !item.alocacoes_maquinas_ativas && !item.alocacoes_notebooks_ativas && !item.alocacoes_aparelhos_ativas && !item.alocacoes_ramais_ativas },
    ],
  }
  const tableData = filteredOverviewData
    ? filteredOverviewData.slice((page - 1) * 20, page * 20)
    : data
  const tableTotal = filteredOverviewData?.length ?? total
  const tableTotalPages = filteredOverviewData ? Math.max(1, Math.ceil(filteredOverviewData.length / 20)) : totalPages

  function applyOverviewFilter(filter: OverviewFilter) {
    if (filter.kind === 'all') {
      setActiveOverviewFilters([])
      setPage(1)
      notifyOverviewFilter([])
      return
    }

    const predicates: Record<string, { label: string; toastLabel?: string; predicate: (item: Colaborador) => boolean }> = {
      'collaborator-status': {
        label: `Colaboradores ${filter.value ?? ''}`,
        predicate: (item) => item.status === filter.value,
      },
      'collaborator-sector': {
        label: `Setor: ${filter.value ?? 'Sem setor'}`,
        predicate: (item) => getColaboradorSetor(item) === filter.value,
      },
      location: {
        label: filter.label ?? 'Unidade selecionada',
        predicate: (item) => filter.value === '__sem_localidade__' ? !item.localidade_id : item.localidade_id === filter.value,
      },
      'collaborator-without-any': {
        label: 'Colaboradores sem alocacao',
        predicate: (item) => item.status === 'Ativo' && !item.alocacoes_maquinas_ativas && !item.alocacoes_notebooks_ativas && !item.alocacoes_aparelhos_ativas && !item.alocacoes_ramais_ativas,
      },
      'collaborator-without-machine': {
        label: 'Colaboradores sem maquina',
        toastLabel: 'sem maquina dispositivo',
        predicate: (item) => item.status === 'Ativo' && !item.alocacoes_maquinas_ativas,
      },
      'collaborator-without-notebook': {
        label: 'Colaboradores sem notebook',
        toastLabel: 'sem notebook dispositivo',
        predicate: (item) => item.status === 'Ativo' && !item.alocacoes_notebooks_ativas,
      },
      'collaborator-without-phone': {
        label: 'Colaboradores sem telefone',
        toastLabel: 'sem telefone dispositivo',
        predicate: (item) => item.status === 'Ativo' && !item.alocacoes_aparelhos_ativas,
      },
      'collaborator-without-extension': {
        label: 'Colaboradores sem ramal',
        toastLabel: 'sem ramal dispositivo',
        predicate: (item) => item.status === 'Ativo' && !item.alocacoes_ramais_ativas,
      },
    }

    const nextFilter = predicates[filter.kind]
    if (!nextFilter) return
    const candidate: ActiveOverviewFilter = {
      ...filter,
      key: getOverviewFilterKey(filter),
      label: nextFilter.toastLabel ?? nextFilter.label,
      predicate: nextFilter.predicate,
    }

    setOverviewFilterLoading(true)
    window.setTimeout(() => {
      setActiveOverviewFilters((currentFilters) => {
        const nextFilters = toggleOverviewFilter(currentFilters, candidate)
        notifyOverviewFilter(nextFilters)
        return nextFilters
      })
      setPage(1)
      setOverviewFilterLoading(false)
    }, 120)
  }

  useEffect(() => {
    if (!setorIdFiltro || overviewData.length === 0) return
    const setorIds = new Set(setorIdFiltro.split(',').map(id => id.trim()).filter(Boolean))
    const sectorNames = Array.from(new Set(
      overviewData
        .filter(item => item.setor_id && setorIds.has(item.setor_id))
        .map(getColaboradorSetor)
        .filter((name): name is string => Boolean(name))
    ))
    if (sectorNames.length === 0) return
    void Promise.resolve().then(() => {
      setActiveOverviewFilters((currentFilters) => {
        const nextFilters = [...currentFilters]
        for (const sectorName of sectorNames) {
          if (nextFilters.some(filter => filter.key === `collaborator-sector:${sectorName}`)) continue
          nextFilters.push({
          kind: 'collaborator-sector',
          value: sectorName,
          label: `Setor: ${sectorName}`,
          key: `collaborator-sector:${sectorName}`,
          predicate: (item) => getColaboradorSetor(item) === sectorName,
          })
        }
        return nextFilters
      })
    })
  }, [setorIdFiltro, overviewData])

  useEffect(() => {
    let cancelled = false
    async function fetchOverview() {
      setOverviewLoading(true)
      try {
        const params = new URLSearchParams({ page: '1', limit: '10000', sort: 'nome', dir: 'asc', overview: 'true' })
        if (localidadeIdFiltro) params.set('localidade_id', localidadeIdFiltro)
        const res = await fetch(`/api/colaboradores?${params}`)
        const json: PaginatedResponse<Colaborador> = await res.json()
        if (!cancelled) {
          setOverviewData(json.data)
          setOverviewTotal(json.total)
        }
      } catch (error) {
        console.error('[colaboradores overview]', error)
      } finally {
        if (!cancelled) setOverviewLoading(false)
      }
    }

    fetchOverview()
    return () => { cancelled = true }
  }, [refreshKey, localidadeIdFiltro])
  
  const filters = (
    <>
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Buscar por nome..."
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <SetorSelect
        value={setorIdFiltro}
        onChange={(value) => {
          setSetorIdFiltro(value)
          setPage(1)
        }}
        placeholder="Filtrar por setor..."
      />
      <LocalidadeSelect
        value={localidadeIdFiltro}
        onChange={(value) => {
          setLocalidadeIdFiltro(value)
          setSetorIdFiltro(null)
          setPage(1)
        }}
        placeholder="Filtrar por localidade..."
      />
      <select
        value={status}
        onChange={(e) => { setStatus(e.target.value); setPage(1) }}
        className="px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Todos os status</option>
        <option value="Ativo">Ativo</option>
        <option value="Inativo">Inativo</option>
      </select>
    </>
  )

  return (
    <div className="mx-auto max-w-screen-2xl p-4 pb-28 md:p-6 md:pb-28 lg:pb-6">
      <PageHeader title="Colaboradores" total={total}>
        {(isAdmin || canRequestInventoryChanges) && (<button type="button" onClick={() => setShowCriar(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition">
          <Plus className="w-4 h-4" /> Novo colaborador
        </button>)}
      </PageHeader>
      <section className={mobileView === 'overview' ? 'block animate-in fade-in slide-in-from-bottom-2 duration-200 lg:block' : 'hidden lg:block'}>
        <ColaboradorOverviewPanel
          total={overviewPanelTotal}
          items={overviewPanelData}
          metricTotal={overviewMetricTotal}
          metricItems={overviewMetricData}
          activeFilters={activeOverviewFilters}
          isLoading={overviewLoading}
          onFilter={applyOverviewFilter}
          exportConfig={overviewExportConfig}
        />
      </section>

      <section className={mobileView === 'registros' ? 'block animate-in fade-in slide-in-from-bottom-2 duration-200 lg:block' : 'hidden lg:block'}>
        <DataTable
          columns={columns}
          data={tableData}
          total={tableTotal}
          page={page}
          totalPages={tableTotalPages}
          onPageChange={setPage}
          onRowClick={openInspect}
          isLoading={loading || overviewFilterLoading}
          filters={filters}
          sort={sort}
          dir={dir}
          onSort={(field, newDir) => { setSort(field); setDir(newDir); setPage(1) }}
        />
      </section>

      <MobileSectionNav
        value={mobileView}
        onViewChange={setMobileView}
        views={INVENTORY_MOBILE_VIEWS}
      />
      <AnimatePresence initial={false}>
        {selected && <ColaboradorModal key={`colaborador-${selected.id}`} colaborador={selected} onClose={closeInspect} onRefresh={() => setRefreshKey(k => k + 1)}/>}
        {showCriar && <CriarColaboradorModal key="criar-colaborador" onClose={() => setShowCriar(false)} onRefresh={() => setRefreshKey(k => k + 1)} />}
      </AnimatePresence>
    </div>
  )
}

function getColaboradorSetor(item?: Colaborador | null) {
  return item?.setor_nome || 'Sem setor'
}

function getOverviewFilterKey(filter: OverviewFilter) {
  return `${filter.kind}:${filter.value ?? ''}`
}

function toggleOverviewFilter(filters: ActiveOverviewFilter[], candidate: ActiveOverviewFilter) {
  if (candidate.kind === 'location') {
    const withoutLocation = filters.filter(filter => filter.kind !== 'location')
    return candidate.value ? [...withoutLocation, candidate] : withoutLocation
  }
  const exists = filters.some(filter => filter.key === candidate.key)
  if (exists) return filters.filter(filter => filter.key !== candidate.key)
  return [...filters, candidate]
}

function matchesOverviewFilters(item: Colaborador, filters: ActiveOverviewFilter[]) {
  const filtersByKind = filters.reduce((map, filter) => {
    const group = map.get(filter.kind) ?? []
    group.push(filter)
    map.set(filter.kind, group)
    return map
  }, new Map<string, ActiveOverviewFilter[]>())

  return Array.from(filtersByKind.values()).every(group =>
    group.some(filter => filter.predicate(item))
  )
}
