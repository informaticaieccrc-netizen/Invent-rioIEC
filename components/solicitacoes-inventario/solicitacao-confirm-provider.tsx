'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import { useSession } from 'next-auth/react'
import { GitPullRequest, Loader2 } from 'lucide-react'

type ConfirmState = {
  title?: string
  description?: string
  resolve: (value: SolicitacaoConfirmResult) => void
}

export type SolicitacaoConfirmResult = {
  confirmed: boolean
  comentario: string
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
  const perfil = (session?.user as { perfil?: string | null } | undefined)?.perfil ?? 'viewer'

  const confirm = useCallback((options?: { title?: string; description?: string }) => {
    return new Promise<SolicitacaoConfirmResult>((resolve) => {
      setClosing(false)
      setComentario('')
      setState({ ...options, resolve })
    })
  }, [])

  function finish(value: boolean) {
    if (!state || closing) return
    setClosing(true)
    state.resolve({ confirmed: value, comentario: value ? comentario.trim() : '' })
    setState(null)
  }

  return (
    <SolicitacaoConfirmContext.Provider value={{ confirm, perfil }}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-950 p-6 shadow-2xl">
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
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => finish(false)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => finish(true)}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
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
    return async () => ({ confirmed: true, comentario: '' })
  }
  return context.confirm
}

export function useSolicitacaoInventarioPerfil() {
  return useContext(SolicitacaoConfirmContext)?.perfil ?? 'admin'
}
