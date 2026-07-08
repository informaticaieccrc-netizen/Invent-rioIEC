'use client'

import { useState, useMemo, useEffect } from 'react'
import { AnimatePresence } from 'motion/react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/tables/data-table'
import {
  AuditOverviewPanel,
  notifyOverviewFilter,
  type OverviewFilter,
} from '@/components/tables/device-overview-panel'
import type { OverviewExportConfig } from '@/components/tables/overview-export-menu'
import { PageHeader } from '@/components/layout/page-header'
import { INVENTORY_MOBILE_VIEWS, MobileSectionNav, type InventoryMobileView } from '@/components/layout/mobile-section-nav'
import { AuditLogModal } from '@/components/modals/audit-log-modal'
import { useFetchData } from '@/hooks/use-fetch-data'
import { Search } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ACAO_COLORS, ACAO_LABELS, TABELAS_OPCOES, type AuditLog } from '@/lib/audit-constants'
import { useInspectNavigation } from '@/hooks/use-inspect-navigation'

function AcaoBadge({ acao }: { acao: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap ${ACAO_COLORS[acao] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
      {ACAO_LABELS[acao] || acao}
    </span>
  )
}

export default function MovimentacoesPage() {
  const [page, setPage] = useState(1)
  const [refreshKey] = useState(0)
  const [selected, setSelected] = useState<AuditLog | null>(null)
  const { openInspect, closeInspect } = useInspectNavigation<AuditLog>(setSelected)
  const router = useRouter()
  const searchParams = useSearchParams()
  const inspectId = searchParams.get('inspect') 
  const [tabela, setTabela] = useState(searchParams.get('tabela') || '')
  const [acao, setAcao] = useState(searchParams.get('acao') || '')
  const [usuario, setUsuario] = useState(searchParams.get('usuario') || '')
  const [usuarioId, setUsuarioId] = useState(searchParams.get('usuario_id') || '')
  const [usuarioLabel, setUsuarioLabel] = useState(searchParams.get('usuario_label') || '')
  const [edicoes, setEdicoes] = useState(searchParams.get('edicoes') === '1' ? '1' : '')
  const [overviewData, setOverviewData] = useState<AuditLog[]>([])
  const [overviewTotal, setOverviewTotal] = useState(0)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [activeOverviewFilter, setActiveOverviewFilter] = useState<{
    label: string
    key: string
    filter: OverviewFilter
    predicate: (item: AuditLog) => boolean
  } | null>(null)
  const [overviewFilterLoading, setOverviewFilterLoading] = useState(false)
  const [mobileView, setMobileView] = useState<InventoryMobileView>('registros')

  const { data, total, totalPages, loading } = useFetchData<AuditLog>(
    'audit-log',
    { tabela, acao, usuario, usuario_id: usuarioId, edicoes },
    page,
    refreshKey
  )

  const filteredOverviewData = activeOverviewFilter
    ? overviewData.filter(activeOverviewFilter.predicate)
    : null
  const urlAuditUserOverviewData = !activeOverviewFilter && (usuarioId || usuarioLabel)
    ? overviewData.filter(item =>
        usuarioId
          ? item.usuario_id === usuarioId
          : (item.usuario_nome || 'Sem responsavel') === usuarioLabel
      )
    : null
  const urlAuditUserFilter = usuarioLabel
    ? {
        kind: 'audit-user',
        value: usuarioId || usuarioLabel,
        label: `Responsavel: ${usuarioLabel}`,
      }
    : null
  const auditOverviewActiveFilters = activeOverviewFilter
    ? [activeOverviewFilter.filter]
    : urlAuditUserFilter
      ? [urlAuditUserFilter]
    : undefined
  const tableData = filteredOverviewData
    ? filteredOverviewData.slice((page - 1) * 20, page * 20)
    : data
  const overviewPanelData = filteredOverviewData ?? urlAuditUserOverviewData ?? overviewData
  const overviewPanelTotal = filteredOverviewData?.length ?? urlAuditUserOverviewData?.length ?? (overviewTotal || total)
  const overviewExportConfig: OverviewExportConfig<AuditLog> = {
    title: 'Overview de Auditoria',
    filename: 'overview-auditoria',
    rows: overviewPanelData,
    activeFilters: auditOverviewActiveFilters,
    columns: [
      { key: 'data', header: 'Data/Hora', value: item => item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : null },
      { key: 'acao', header: 'Ação', value: item => ACAO_LABELS[item.acao] || item.acao },
      { key: 'modulo', header: 'Módulo', value: item => TABELAS_OPCOES.find(t => t.value === item.tabela)?.label || item.tabela },
      { key: 'descricao', header: 'Descrição', value: item => item.descricao },
      { key: 'responsavel', header: 'Responsável', value: item => item.usuario_nome },
    ],
  }
  const tableTotal = filteredOverviewData?.length ?? total
  const tableTotalPages = filteredOverviewData ? Math.max(1, Math.ceil(filteredOverviewData.length / 20)) : totalPages

  function overviewFilterKey(filter: { kind: string; value?: string }) {
    return `${filter.kind}:${filter.value ?? ''}`
  }

  function isUuid(value?: string) {
    return Boolean(value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i))
  }

  function replaceAuditUrl(next: {
    tabela?: string
    acao?: string
    usuario?: string
    usuarioId?: string
    usuarioLabel?: string
    edicoes?: string
  }) {
    const params = new URLSearchParams()
    const nextTabela = next.tabela ?? tabela
    const nextAcao = next.acao ?? acao
    const nextUsuario = next.usuario ?? usuario
    const nextUsuarioId = next.usuarioId ?? usuarioId
    const nextUsuarioLabel = next.usuarioLabel ?? usuarioLabel
    const nextEdicoes = next.edicoes ?? edicoes

    if (nextTabela) params.set('tabela', nextTabela)
    if (nextAcao) params.set('acao', nextAcao)
    if (nextUsuario) params.set('usuario', nextUsuario)
    if (nextUsuarioId) params.set('usuario_id', nextUsuarioId)
    if (nextUsuarioLabel) params.set('usuario_label', nextUsuarioLabel)
    if (nextEdicoes) params.set('edicoes', nextEdicoes)

    const query = params.toString()
    router.replace(`/movimentacoes${query ? `?${query}` : ''}`, { scroll: false })
  }

  function clearAuditUserFilter() {
    setActiveOverviewFilter(null)
    setUsuarioId('')
    setUsuarioLabel('')
    setUsuario('')
    setEdicoes('')
    setPage(1)
    replaceAuditUrl({ usuario: '', usuarioId: '', usuarioLabel: '', edicoes: '' })
  }

  function applyOverviewFilter(filter: OverviewFilter) {
    if (filter.kind === 'all') {
      clearAuditUserFilter()
      notifyOverviewFilter([])
      return
    }

    const filterKey = overviewFilterKey(filter)
    const selectedKey = activeOverviewFilter?.key ?? (urlAuditUserFilter ? overviewFilterKey(urlAuditUserFilter) : '')
    if (filter.kind !== 'audit-user' && activeOverviewFilter?.key === filterKey) {
      setActiveOverviewFilter(null)
      setPage(1)
      notifyOverviewFilter([])
      return
    }
    if (filter.kind === 'audit-user' && filterKey === selectedKey) {
      clearAuditUserFilter()
      notifyOverviewFilter([])
      return
    }

    if (filter.kind === 'audit-user') {
      const value = filter.value ?? ''
      const nextUsuarioId = isUuid(value) ? value : ''
      const nextUsuario = nextUsuarioId ? '' : value
      const nextLabel = (filter.label ?? value).replace(/^Responsavel:\s*/i, '') || value || 'Sem responsavel'
      setActiveOverviewFilter(null)
      setUsuarioId(nextUsuarioId)
      setUsuario(nextUsuario)
      setUsuarioLabel(nextLabel)
      setAcao('')
      setEdicoes('1')
      setPage(1)
      replaceAuditUrl({
        usuarioId: nextUsuarioId,
        usuario: nextUsuario,
        usuarioLabel: nextLabel,
        acao: '',
        edicoes: '1',
      })
      notifyOverviewFilter([{ ...filter, label: `Responsavel: ${nextLabel}` }])
      return
    }

    const labelToAction = Object.entries(ACAO_LABELS).find(([, label]) => label === filter.value)?.[0] ?? filter.value
    const predicates: Record<string, { label: string; predicate: (item: AuditLog) => boolean }> = {
      'audit-forum': {
        label: 'Fórum',
        predicate: (item) => item.tabela.startsWith('forum_'),
      },
      'audit-inventory': {
        label: 'Inventário',
        predicate: (item) => !item.tabela.startsWith('forum_') && item.tabela !== 'solicitacoes_inventario',
      },
      'audit-inventory-requests': {
        label: 'Pedidos de inventário',
        predicate: (item) => item.tabela === 'solicitacoes_inventario',
      },
      'audit-edits': {
        label: 'Edicoes registradas',
        predicate: (item) => item.acao === 'UPDATE' || item.acao === 'EDITAR_ALOCACAO',
      },
      'audit-action': {
        label: `Acao: ${ACAO_LABELS[filter.value ?? ''] ?? filter.value}`,
        predicate: (item) => item.acao === filter.value,
      },
      'audit-action-label': {
        label: `Acao: ${filter.value}`,
        predicate: (item) => item.acao === labelToAction,
      },
      'audit-inventory-action-label': {
        label: `Inventário: ${filter.value}`,
        predicate: (item) => !item.tabela.startsWith('forum_') && item.tabela !== 'solicitacoes_inventario' && item.acao === labelToAction,
      },
      'audit-forum-action-label': {
        label: `Fórum: ${filter.value}`,
        predicate: (item) => item.tabela.startsWith('forum_') && item.acao === labelToAction,
      },
      'audit-inventory-request-action-label': {
        label: `Pedidos: ${filter.value}`,
        predicate: (item) => item.tabela === 'solicitacoes_inventario' && item.acao === labelToAction,
      },
      'audit-user': {
        label: filter.label ?? `Responsavel: ${filter.value ?? 'Sem responsavel'}`,
        predicate: (item) => item.usuario_id === filter.value || (item.usuario_nome || 'Sem responsavel') === filter.value,
      },
    }

    const nextFilter = predicates[filter.kind]
    if (!nextFilter) return

    setOverviewFilterLoading(true)
    if (usuarioId || usuarioLabel || edicoes) {
      setUsuarioId('')
      setUsuarioLabel('')
      setUsuario('')
      setEdicoes('')
      replaceAuditUrl({ usuario: '', usuarioId: '', usuarioLabel: '', edicoes: '' })
    }
    window.setTimeout(() => {
      setActiveOverviewFilter({ ...nextFilter, key: filterKey, filter })
      setPage(1)
      setOverviewFilterLoading(false)
      notifyOverviewFilter([{ ...filter, label: nextFilter.label }])
    }, 120)
  }

  useEffect(() => {
    let cancelled = false
    async function fetchOverview() {
      setOverviewLoading(true)
      try {
        const params = new URLSearchParams({ page: '1', limit: '10000', sort: 'created_at', dir: 'desc' })
        if (tabela) params.set('tabela', tabela)
        if (acao) params.set('acao', acao)
        const res = await fetch(`/api/audit-log?${params}`)
        const json = await res.json()
        if (!cancelled) {
          setOverviewData(json.data ?? [])
          setOverviewTotal(json.total ?? 0)
        }
      } catch (error) {
        console.error('[audit overview]', error)
      } finally {
        if (!cancelled) setOverviewLoading(false)
      }
    }

    fetchOverview()
    return () => { cancelled = true }
  }, [refreshKey, tabela, acao])

  const columns = useMemo<ColumnDef<AuditLog, unknown>[]>(() => [
    {
      accessorKey: 'created_at',
      header: 'Data/Hora',
      cell: ({ row }) => {
        const d = row.original.created_at
        if (!d) return '—'
        const date = new Date(d)
        return (
          <span className="text-xs font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
            {date.toLocaleDateString('pt-BR')}{' '}
            {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )
      },
    },
    {
      accessorKey: 'acao',
      header: 'Ação',
      cell: ({ row }) => <AcaoBadge acao={row.original.acao} />,
    },
    {
      accessorKey: 'tabela',
      header: 'Módulo',
      cell: ({ row }) => {
        const label = TABELAS_OPCOES.find(t => t.value === row.original.tabela)?.label
          || row.original.tabela
        return <span className="text-xs text-slate-600 dark:text-slate-400">{label}</span>
      },
    },
    {
      accessorKey: 'descricao',
      header: 'Descrição',
      cell: ({ row }) => (
        <span className="text-sm text-slate-700 dark:text-slate-300 max-w-xs truncate block">
          {row.original.descricao || '—'}
        </span>
      ),
    },
    {
      accessorKey: 'usuario_nome',
      header: 'Responsável',
      cell: ({ row }) => (
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
          {row.original.usuario_nome || '—'}
        </span>
      ),
    },
  ], [])
  
  useEffect(() => {
  if (!inspectId) return
  fetch(`/api/audit-log/by-id/${inspectId}`)
    .then(r => r.json())
    .then(json => { if (json?.id) setSelected(json) })
    .catch(() => {})
}, [inspectId])

  const filters = (
    <>
      <select
        value={tabela}
        onChange={(e) => { setTabela(e.target.value); setPage(1) }}
        className="crc-select w-auto min-w-48"
      >
        <option value="">Todos os módulos</option>
        {TABELAS_OPCOES.map(t => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>

      <select
        value={acao}
        onChange={(e) => { setAcao(e.target.value); setPage(1) }}
        disabled={edicoes === '1'}
        className="crc-select w-auto min-w-44 disabled:opacity-60"
      >
        <option value="">Todas as ações</option>
        <option value="CREATE">Criação</option>
        <option value="UPDATE">Edição</option>
        <option value="DELETE">Exclusão</option>
        <option value="ALOCAR">Alocação</option>
        <option value="DESALOCAR">Desalocação</option>
        <option value="EDITAR_ALOCACAO">Edição de Alocação</option>
        <option value="APROVAR">Aprovação</option>
        <option value="REJEITAR">Rejeição</option>
      </select>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={usuario}
          onChange={(e) => {
            setUsuario(e.target.value)
            setUsuarioId('')
            setUsuarioLabel('')
            setEdicoes('')
            setActiveOverviewFilter(null)
            setPage(1)
          }}
          placeholder={usuarioId ? 'Filtro por usuário selecionado' : 'Filtrar por responsável...'}
          className="pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
        />
      </div>
      {(usuarioId || usuarioLabel) && (
        <button
          type="button"
          onClick={clearAuditUserFilter}
          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
          title={usuarioId || usuarioLabel}
        >
          {edicoes === '1' ? 'Edições de ' : 'Ações de '}
          {usuarioLabel || 'usuário selecionado'}
        </button>
      )}
    </>
  )

  return (
    <div className="mx-auto max-w-screen-2xl p-4 pb-28 md:p-6 md:pb-28 lg:pb-6">
      <PageHeader
        title="Log de Auditoria"
        description="Registro de todas as alterações realizadas no sistema"
        total={total}
      />

      <section className={mobileView === 'overview' ? 'block animate-in fade-in slide-in-from-bottom-2 duration-200 lg:block' : 'hidden lg:block'}>
        <AuditOverviewPanel
          total={overviewPanelTotal}
          items={overviewPanelData}
          activeFilters={auditOverviewActiveFilters}
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
        />
      </section>

      <MobileSectionNav
        value={mobileView}
        onViewChange={setMobileView}
        views={INVENTORY_MOBILE_VIEWS}
      />

      <AnimatePresence initial={false}>
        {selected && (
          <AuditLogModal
            key={`audit-${selected.id}`}
            log={selected}
            onClose={closeInspect}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
