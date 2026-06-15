'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, GitPullRequest, Loader2, RefreshCcw, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { usePermission } from '@/hooks/use-permission'
import { AnimatedSheetFrame } from '@/components/layout/motion-primitives'
import { cn } from '@/lib/utils'

type Pedido = {
  id: string
  status: 'pendente' | 'aprovada' | 'recusada'
  tipo_recurso: string
  recurso_id: string | null
  acao: string
  dados_anteriores: Record<string, unknown> | null
  dados_propostos: Record<string, unknown> | null
  solicitante_nome: string | null
  revisor_nome: string | null
  parecer: string | null
  erro_aplicacao: string | null
  created_at: string | null
  revisado_em: string | null
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
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Criação',
  UPDATE: 'Edição',
  DELETE: 'Exclusão',
  ALLOCATE: 'Alocação',
  DEALLOCATE: 'Desalocação',
  CORRECTION: 'Correção',
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function diffRows(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  const previous = before ?? {}
  const next = after ?? {}
  const keys = Array.from(new Set([...Object.keys(previous), ...Object.keys(next)]))
    .filter(key => !['id', 'created_at', 'updated_at'].includes(key))
    .filter(key => JSON.stringify(previous[key]) !== JSON.stringify(next[key]))

  return keys.map(key => ({
    key,
    before: previous[key],
    after: next[key],
  }))
}

function valueText(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export default function PedidosPage() {
  const { perfil, isLoading } = usePermission()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('pendente')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Pedido | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [parecer, setParecer] = useState('')

  const isAdminOnly = perfil === 'admin' || perfil === 'dev'

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      const res = await fetch(`/api/solicitacoes-inventario?${params}`)
      if (!res.ok) throw new Error('Erro ao carregar pedidos')
      const json = await res.json()
      setPedidos(json.data ?? [])
    } catch (error: any) {
      toast.error(error.message ?? 'Erro ao carregar pedidos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAdminOnly) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isAdminOnly])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return pedidos
    return pedidos.filter(pedido => [
      pedido.solicitante_nome,
      pedido.tipo_recurso,
      pedido.acao,
      pedido.recurso_id,
    ].some(value => String(value ?? '').toLowerCase().includes(term)))
  }, [pedidos, query])

  async function review(decisao: 'aprovar' | 'recusar') {
    if (!selected) return
    setReviewing(true)
    try {
      const res = await fetch(`/api/solicitacoes-inventario/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisao, parecer }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Erro ao revisar pedido')
      toast.success(decisao === 'aprovar' ? 'Pedido aprovado.' : 'Pedido recusado.')
      setSelected(null)
      setParecer('')
      await load()
    } catch (error: any) {
      toast.error(error.message ?? 'Erro ao revisar pedido')
      await load()
    } finally {
      setReviewing(false)
    }
  }

  if (isLoading) return null

  if (!isAdminOnly) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-white">Pedidos</h1>
        <p className="mt-2 text-slate-400">Esta área é restrita a administradores.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6 text-slate-100">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Pedidos</h1>
          <p className="mt-1 text-sm text-slate-400">Solicitações de alteração aguardando revisão administrativa</p>
          <p className="mt-1 text-sm text-slate-500">{filtered.length} registro(s)</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
        >
          <RefreshCcw className="h-4 w-4" />
          Atualizar
        </button>
      </div>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Buscar por solicitante, recurso ou ação..."
            className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-10 pr-3 text-sm text-white outline-none transition focus:border-blue-500"
          />
        </div>
        <select
          value={status}
          onChange={event => setStatus(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500"
        >
          <option value="pendente">Pendentes</option>
          <option value="aprovada">Aprovadas</option>
          <option value="recusada">Recusadas</option>
          <option value="">Todas</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando pedidos...
        </div>
      ) : (
        <motion.div layout className="grid gap-3">
          <AnimatePresence initial={false}>
            {filtered.map(pedido => (
              <motion.article
                key={pedido.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.16 }}
                className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 transition hover:border-blue-500/70"
              >
                <button type="button" onClick={() => setSelected(pedido)} className="block w-full text-left">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-blue-600/15 px-2 py-1 text-xs font-semibold text-blue-300">
                          {ACTION_LABELS[pedido.acao] ?? pedido.acao}
                        </span>
                        <span className={cn(
                          'rounded-md px-2 py-1 text-xs font-semibold',
                          pedido.status === 'pendente' && 'bg-amber-500/15 text-amber-300',
                          pedido.status === 'aprovada' && 'bg-emerald-500/15 text-emerald-300',
                          pedido.status === 'recusada' && 'bg-rose-500/15 text-rose-300',
                        )}>
                          {pedido.status}
                        </span>
                      </div>
                      <h2 className="truncate text-base font-semibold text-white">
                        {RESOURCE_LABELS[pedido.tipo_recurso] ?? pedido.tipo_recurso}
                      </h2>
                      <p className="mt-1 text-sm text-slate-400">
                        Solicitado por {pedido.solicitante_nome ?? 'Usuário'} em {formatDate(pedido.created_at)}
                      </p>
                    </div>
                    <GitPullRequest className="h-5 w-5 text-slate-500" />
                  </div>
                </button>
              </motion.article>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <AnimatePresence>
        {selected && (
          <AnimatedSheetFrame key={selected.id} onClose={() => setSelected(null)} className="max-w-2xl">
            <div className="border-b border-slate-800 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">Revisão de pedido</p>
                  <h2 className="mt-2 text-xl font-bold text-white">{RESOURCE_LABELS[selected.tipo_recurso] ?? selected.tipo_recurso}</h2>
                  <p className="mt-1 text-sm text-slate-400">{ACTION_LABELS[selected.acao] ?? selected.acao} por {selected.solicitante_nome ?? 'Usuário'}</p>
                </div>
                <button type="button" onClick={() => setSelected(null)} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {selected.erro_aplicacao && (
                <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                  {selected.erro_aplicacao}
                </div>
              )}

              <div className="space-y-3">
                {diffRows(selected.dados_anteriores, selected.dados_propostos).map(row => (
                  <div key={row.key} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                    <p className="mb-2 text-sm font-semibold text-white">{row.key}</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="rounded-md bg-rose-500/10 p-2 text-sm text-rose-100">
                        <p className="mb-1 text-xs font-semibold uppercase text-rose-300">Antes</p>
                        <p className="break-all">{valueText(row.before)}</p>
                      </div>
                      <div className="rounded-md bg-emerald-500/10 p-2 text-sm text-emerald-100">
                        <p className="mb-1 text-xs font-semibold uppercase text-emerald-300">Proposto</p>
                        <p className="break-all">{valueText(row.after)}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {diffRows(selected.dados_anteriores, selected.dados_propostos).length === 0 && (
                  <p className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                    Nenhuma diferença estruturada detectada.
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-slate-800 p-5">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Parecer opcional</label>
              <textarea
                value={parecer}
                onChange={event => setParecer(event.target.value)}
                rows={3}
                className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none transition focus:border-blue-500"
                placeholder="Informe uma observação para o solicitante..."
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => review('recusar')}
                  disabled={reviewing || selected.status !== 'pendente'}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-rose-500/50 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/10 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                  Recusar
                </button>
                <button
                  type="button"
                  onClick={() => review('aprovar')}
                  disabled={reviewing || selected.status !== 'pendente'}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                >
                  {reviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Aprovar
                </button>
              </div>
            </div>
          </AnimatedSheetFrame>
        )}
      </AnimatePresence>
    </div>
  )
}
