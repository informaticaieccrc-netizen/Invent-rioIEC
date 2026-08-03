'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search, X, Plus, Monitor, Laptop, Smartphone, Phone, Check } from 'lucide-react'
import { toast } from 'sonner'
import { usePermission } from '@/hooks/use-permission'
import { useSolicitacaoInventarioConfirm } from '@/components/solicitacoes-inventario/solicitacao-confirm-provider'
import { writePendingInspectPreview } from '@/lib/navigation-context'
import { updatePedidoMaloteAfterSubmit, withPedidoMaloteContext } from '@/lib/solicitacoes-inventario-client'

type TipoItem = 'maquinas' | 'notebooks' | 'aparelhos' | 'ramais'

interface SearchResult {
  id: string
  label: string
  sub: string
  meta: string
}

const TIPO_OPTIONS: { value: TipoItem; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'maquinas',  label: 'Máquina',  icon: Monitor,    color: 'text-blue-500'    },
  { value: 'notebooks', label: 'Notebook', icon: Laptop,     color: 'text-violet-500'  },
  { value: 'aparelhos', label: 'Aparelho', icon: Smartphone, color: 'text-cyan-500'    },
  { value: 'ramais',    label: 'Ramal',    icon: Phone,      color: 'text-emerald-500' },
]

const ALOCACAO_ENDPOINTS: Record<TipoItem, { key: string; url: string }> = {
  maquinas:  { key: 'maquina_id',  url: '/api/alocacoes/maquinas'  },
  notebooks: { key: 'notebook_id', url: '/api/alocacoes/notebooks' },
  aparelhos: { key: 'aparelho_id', url: '/api/alocacoes/aparelhos' },
  ramais:    { key: 'ramal_id',    url: '/api/alocacoes/ramais'    },
}

interface Props {
  colaboradorId: string
  onSuccess: () => void
}

export function AdicionarAlocacaoForm({ colaboradorId, onSuccess }: Props) {
  const router = useRouter()
  const { isAdmin, canRequestInventoryChanges } = usePermission()
  const confirmSolicitacao = useSolicitacaoInventarioConfirm()
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState<TipoItem>('maquinas')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  // Campo extra para ramais
  const [whatsapp, setWhatsapp] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function abrirPedidoCriado(pedido: { id?: string; acao?: string } | null) {
    if (!pedido?.id) return
    const href = `/pedidos?inspect=${pedido.id}`
    writePendingInspectPreview(window.sessionStorage, href, {
      title: selected?.label ?? 'Pedido de inventário',
      subtitle: pedido.acao ? `Pedido ${pedido.acao}` : 'Pedido de inventário',
    })
    router.push(href)
  }

  // Busca com debounce
  useEffect(() => {
    if (query.length < 2) { setResults([]); setShowDropdown(false); return }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/inventario/search?tipo=${tipo}&q=${encodeURIComponent(query)}`)
        const json = await res.json()
        setResults(json.results || [])
        setShowDropdown(true)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, tipo])

  // Reset ao mudar tipo
  useEffect(() => {
    setQuery('')
    setSelected(null)
    setResults([])
    setShowDropdown(false)
    setWhatsapp(false)
  }, [tipo])

  async function handleAlocar() {
    if (!selected) return
    setSaving(true)

    const endpoint = ALOCACAO_ENDPOINTS[tipo]
    const body: Record<string, string | boolean> = {
      [endpoint.key]: selected.id,
      colaborador_id: colaboradorId,
    }
    if (tipo === 'ramais') body.whatsapp = whatsapp

    try {
      if (!isAdmin) {
        if (!canRequestInventoryChanges) {
          throw new Error('Acesso negado. Apenas administradores e desenvolvimento podem realizar esta ação.')
        }

        const solicitacao = await confirmSolicitacao({
          title: `Solicitar alocação de ${TIPO_OPTIONS.find(t => t.value === tipo)?.label}`,
          description: 'Essa alocação será enviada para revisão antes de alterar o inventário.',
        })
        if (!solicitacao.confirmed) return

        const res = await fetch('/api/solicitacoes-inventario', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withPedidoMaloteContext({
            tipo_recurso: `alocacoes_${tipo}`,
            acao: 'ALLOCATE',
            dados_propostos: body,
            comentario: solicitacao.comentario,
          })),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(typeof err.error === 'string' ? err.error : 'Erro ao criar solicitação')
        }

        const pedido = await res.json().catch(() => null)
        updatePedidoMaloteAfterSubmit(solicitacao.adicionarMaisPedidos, pedido, selected.label)
        toast.success(solicitacao.adicionarMaisPedidos ? 'Solicitação enviada. Malote ativo para o próximo pedido.' : 'Solicitação enviada para aprovação.')
        setOpen(false)
        setQuery('')
        setSelected(null)
        setWhatsapp(false)
        onSuccess()
        if (!solicitacao.adicionarMaisPedidos) abrirPedidoCriado(pedido)
        return
      }

      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erro ao alocar')
      }
      toast.success(`${TIPO_OPTIONS.find(t => t.value === tipo)?.label} alocado com sucesso!`)
      setOpen(false)
      setQuery('')
      setSelected(null)
      setWhatsapp(false)
      onSuccess()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao alocar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const tipoConfig = TIPO_OPTIONS.find(t => t.value === tipo)!

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 100) }}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-600 dark:hover:text-blue-400 text-sm font-medium transition"
      >
        <Plus className="w-4 h-4" />
        Adicionar alocação
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-blue-100 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/20 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">
          Nova Alocação
        </p>
        <button
          type="button"
          onClick={() => { setOpen(false); setQuery(''); setSelected(null) }}
          className="text-slate-400 hover:text-slate-600 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Seletor de tipo */}
      <div className="grid grid-cols-4 gap-1.5">
        {TIPO_OPTIONS.map(opt => {
          const Icon = opt.icon
          const active = tipo === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTipo(opt.value)}
              className={`
                flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition
                ${active
                  ? 'border-blue-500 bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                }
              `}
            >
              <Icon className={`w-4 h-4 ${active ? opt.color : ''}`} />
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Campo de busca */}
      <div className="relative">
        <div className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900">
          {searching
            ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin shrink-0" />
            : <Search className="w-4 h-4 text-slate-400 shrink-0" />
          }
          <input
            ref={inputRef}
            type="text"
            value={selected ? selected.label : query}
            onChange={(e) => {
              if (selected) setSelected(null)
              setQuery(e.target.value)
            }}
            onFocus={() => { if (results.length > 0) setShowDropdown(true) }}
            placeholder={
              tipo === 'maquinas'  ? 'Buscar por nome host, identificador ou IP...' :
              tipo === 'notebooks' ? 'Buscar por modelo, patrimônio ou fabricante...' :
              tipo === 'aparelhos' ? 'Buscar por modelo ou endereço IP...' :
              'Buscar por número ou setor do ramal...'
            }
            className="flex-1 text-sm bg-transparent outline-none text-slate-900 dark:text-slate-100 placeholder-slate-400"
          />
          {(selected || query) && (
            <button
              type="button"
              onClick={() => { setSelected(null); setQuery(''); setResults([]); setShowDropdown(false) }}
              className="text-slate-400 hover:text-slate-600 transition shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Dropdown de resultados */}
        {showDropdown && results.length > 0 && !selected && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
            <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-52 overflow-y-auto">
              {results.map(result => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => {
                    setSelected(result)
                    setQuery(result.label)
                    setShowDropdown(false)
                  }}
                  className="w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition border-b border-slate-50 dark:border-slate-700/50 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <tipoConfig.icon className={`w-3.5 h-3.5 shrink-0 ${tipoConfig.color}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{result.label}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {result.sub && <span className="text-xs text-slate-400 truncate">{result.sub}</span>}
                        {result.meta && <span className="text-[11px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">{result.meta}</span>}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {showDropdown && results.length === 0 && !searching && query.length >= 2 && (
          <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-400">Nenhum resultado para "{query}"</p>
          </div>
        )}
      </div>

      {/* Item selecionado — card de confirmação */}
      {selected && (
        <div className="rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-green-800 dark:text-green-300 truncate">{selected.label}</p>
              {selected.sub && <p className="text-xs text-green-600 dark:text-green-500 truncate">{selected.sub}</p>}
            </div>
          </div>

          {/* Campo extra: WhatsApp para ramais */}
          {tipo === 'ramais' && (
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={whatsapp}
                onChange={e => setWhatsapp(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-green-700 dark:text-green-300 font-medium">
                Habilitar WhatsApp neste ramal
              </span>
            </label>
          )}
        </div>
      )}

      {/* Botão de confirmar */}
      <button
        type="button"
        onClick={handleAlocar}
        disabled={!selected || saving}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {saving
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <Plus className="w-4 h-4" />
        }
        {saving ? 'Alocando...' : `Alocar ${tipoConfig.label}`}
      </button>
    </div>
  )
}
