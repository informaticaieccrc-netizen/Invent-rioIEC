'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import { useSession } from 'next-auth/react'
import { GitPullRequest, Loader2 } from 'lucide-react'
import {
  clearPedidoMaloteContext,
  readPedidoMaloteContext,
  type PedidoMaloteContext,
} from '@/lib/solicitacoes-inventario-client'

type ConfirmState = {
  title?: string
  description?: string
  resolve: (value: SolicitacaoConfirmResult) => void
}

export type SolicitacaoConfirmResult = {
  confirmed: boolean
  comentario: string
  adicionarMaisPedidos: boolean
}

type SolicitacaoContextValue = {
  confirm: (options?: { title?: string; description?: string }) => Promise<SolicitacaoConfirmResult>
  perfil: string
}

const SolicitacaoConfirmContext = createContext<SolicitacaoContextValue | null>(null)

export function SolicitacaoConfirmProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const [state, setState] = useState<ConfirmState | null>(null)
  const [closing, setClosing] = useState(false)
  const [comentario, setComentario] = useState('')
  const [maloteContext, setMaloteContext] = useState<PedidoMaloteContext | null>(null)
  const perfil = (session?.user as { perfil?: string | null } | undefined)?.perfil ?? 'viewer'

  const confirm = useCallback((options?: { title?: string; description?: string }) => {
    return new Promise<SolicitacaoConfirmResult>((resolve) => {
      setClosing(false)
      setComentario('')
      setMaloteContext(readPedidoMaloteContext())
      setState({ ...options, resolve })
    })
  }, [])

  function clearMalote() {
    clearPedidoMaloteContext()
    setMaloteContext(null)
  }

  function finish(value: boolean, adicionarMaisPedidos = false) {
    if (!state || closing) return
    setClosing(true)
    state.resolve({
      confirmed: value,
      comentario: value ? comentario.trim() : '',
      adicionarMaisPedidos: value ? adicionarMaisPedidos : false,
    })
    setState(null)
  }

  return (
    <SolicitacaoConfirmContext.Provider value={{ confirm, perfil }}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600/15 text-blue-300">
                <GitPullRequest className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-white">
                  {state.title ?? 'Deseja confirmar sua solicitação de alteração?'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {state.description ?? 'Essa ação será enviada para revisão de um administrador antes de alterar o inventário.'}
                </p>
              </div>
            </div>
            {maloteContext && (
              <div className="mt-5 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-200">Malote ativo</p>
                    <p className="mt-1 text-sm leading-5 text-blue-100">
                      Esta solicitação será empilhada sobre {maloteContext.label ?? 'o pedido selecionado'}.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearMalote}
                    className="shrink-0 rounded-lg border border-blue-400/30 px-2.5 py-1.5 text-xs font-semibold text-blue-100 transition hover:bg-blue-500/15"
                  >
                    Remover
                  </button>
                </div>
              </div>
            )}
            <label className="mt-5 block">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Comentário opcional
              </span>
              <textarea
                value={comentario}
                onChange={event => setComentario(event.target.value)}
                rows={3}
                placeholder="Contextualize o que deve ser revisado..."
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-500"
              />
            </label>
            <div className="mt-6 grid gap-2 sm:grid-cols-[auto_1fr_1fr]">
              <button
                type="button"
                onClick={() => finish(false)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => finish(true, true)}
                className="flex items-center justify-center rounded-lg border border-blue-500/40 px-4 py-2 text-sm font-semibold text-blue-200 transition hover:bg-blue-500/10"
              >
                Adicionar mais pedidos
              </button>
              <button
                type="button"
                onClick={() => finish(true)}
                className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
              >
                {closing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirmar solicitação
              </button>
            </div>
          </div>
        </div>
      )}
    </SolicitacaoConfirmContext.Provider>
  )
}

export function useSolicitacaoInventarioConfirm() {
  const context = useContext(SolicitacaoConfirmContext)
  if (!context) {
    return async () => ({ confirmed: true, comentario: '', adicionarMaisPedidos: false })
  }
  return context.confirm
}

export function useSolicitacaoInventarioPerfil() {
  return useContext(SolicitacaoConfirmContext)?.perfil ?? 'admin'
}
