'use client'
import { usePermission } from '@/hooks/use-permission'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  User,
  UserMinus,
  UserPlus,
  Loader2,
  Check,
  CalendarDays,
  Building2,
  MessageCircle,
  ArrowUpRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { ColaboradorSelect } from '@/components/modals/colaborador-select'
import { ConfirmDialog } from '@/components/modals/confirm-dialog'
import { formatDate } from '@/lib/utils'
import { writePendingInspectPreview } from '@/lib/navigation-context'
import { useSolicitacaoInventarioConfirm } from '@/components/solicitacoes-inventario/solicitacao-confirm-provider'
import { updatePedidoMaloteAfterSubmit, withPedidoMaloteContext } from '@/lib/solicitacoes-inventario-client'

interface AlocacaoItem {
  id: string
  colaborador: { id?: string; nome: string; setor_rel: { nome: string | null } }
  data_inicio: string | null
  whatsapp?: boolean | null    // apenas ramais
  extra?: React.ReactNode      // slot para campos específicos
}

interface Props {
  itemId: string
  entidade: 'maquinas' | 'notebooks' | 'aparelhos' | 'ramais'
  alocacoes: AlocacaoItem[]
  onRefresh: () => void
  onClose: () => void
}

export function AlocacoesAtivasSection({
  itemId,
  entidade,
  alocacoes,
  onRefresh,
}: Props) {
  const { isAdmin, canRequestInventoryChanges } = usePermission()
  const confirmSolicitacao = useSolicitacaoInventarioConfirm()
  const router = useRouter()
  const [novoColabId, setNovoColabId] = useState('')
  const [novoColabNome, setNovoColabNome] = useState('')
  const [savingNova, setSavingNova] = useState(false)
  const [desalocandoId, setDesalocandoId] = useState<string | null>(null)
  const [confirmDesalocar, setConfirmDesalocar] = useState<AlocacaoItem | null>(null)
  const [editandoWhatsappId, setEditandoWhatsappId] = useState<string | null>(null)
  const [novoWhatsapp, setNovoWhatsapp] = useState(false)
  const [savingWhatsapp, setSavingWhatsapp] = useState(false)
  const totalAlocacoes = alocacoes.length

  function abrirColaborador(aloc: AlocacaoItem) {
    const colaboradorId = aloc.colaborador.id
    if (!colaboradorId) return

    const href = `/colaboradores?inspect=${colaboradorId}`
    writePendingInspectPreview(window.sessionStorage, href, {
      title: aloc.colaborador.nome,
      subtitle: aloc.colaborador.setor_rel.nome ?? undefined,
    })
    router.push(href)
  }

  function abrirPedidoCriado(pedido: { id?: string; dados_propostos?: { colaborador_nome?: string }; acao?: string }) {
    if (!pedido.id) return
    const href = `/pedidos?inspect=${pedido.id}`
    writePendingInspectPreview(window.sessionStorage, href, {
      title: pedido.dados_propostos?.colaborador_nome ?? novoColabNome ?? 'Pedido de inventário',
      subtitle: pedido.acao ? `Pedido ${pedido.acao}` : 'Pedido de inventário',
    })
    router.push(href)
  }

  async function assertResponseOk(res: Response, fallback: string) {
    if (res.ok) return
    const err = await res.json().catch(() => ({}))
    throw new Error(typeof err.error === 'string' ? err.error : fallback)
  }

  // Alocar novo colaborador
  async function alocar() {
    if (!novoColabId) return
    setSavingNova(true)
    try {
      const bodyMap: Record<Props['entidade'], Record<string, string>> = {
        maquinas:  { maquina_id:  itemId, colaborador_id: novoColabId },
        notebooks: { notebook_id: itemId, colaborador_id: novoColabId },
        aparelhos: { aparelho_id: itemId, colaborador_id: novoColabId },
        ramais:    { ramal_id:    itemId, colaborador_id: novoColabId },
      }
      if (!isAdmin) {
        const solicitacao = await confirmSolicitacao()
        if (!solicitacao.confirmed) return
        const res = await fetch('/api/solicitacoes-inventario', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withPedidoMaloteContext({
            tipo_recurso: `alocacoes_${entidade}`,
            acao: 'ALLOCATE',
            dados_propostos: bodyMap[entidade],
            comentario: solicitacao.comentario,
          })),
        })
        await assertResponseOk(res, 'Erro ao criar solicitação de alocação.')
        const pedido = await res.json().catch(() => null)
        updatePedidoMaloteAfterSubmit(solicitacao.adicionarMaisPedidos, pedido, novoColabNome)
        toast.success(solicitacao.adicionarMaisPedidos ? 'Solicitação enviada. Malote ativo para o próximo pedido.' : 'Solicitação enviada para aprovação.')
        setNovoColabId('')
        setNovoColabNome('')
        if (pedido && !solicitacao.adicionarMaisPedidos) abrirPedidoCriado(pedido)
        return
      }
      const res = await fetch(`/api/alocacoes/${entidade}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyMap[entidade]),
      })
      await assertResponseOk(res, 'Erro ao alocar colaborador.')
      toast.success('Colaborador alocado!')
      setNovoColabId('')
      setNovoColabNome('')
      onRefresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao alocar.')
    } finally {
      setSavingNova(false)
    }
  }

  // Desalocar colaborador específico pelo ID da alocação
  async function desalocar(alocacaoId: string) {
    setDesalocandoId(alocacaoId)
    try {
      if (!isAdmin) {
        const previous = alocacoes.find(aloc => aloc.id === alocacaoId) ?? null
        const solicitacao = await confirmSolicitacao()
        if (!solicitacao.confirmed) return
        const res = await fetch('/api/solicitacoes-inventario', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withPedidoMaloteContext({
            tipo_recurso: `alocacoes_${entidade}`,
            recurso_id: alocacaoId,
            acao: 'DEALLOCATE',
            dados_anteriores: previous,
            dados_propostos: {},
            comentario: solicitacao.comentario,
          })),
        })
        await assertResponseOk(res, 'Erro ao criar solicitação de desalocação.')
        const pedido = await res.json().catch(() => null)
        updatePedidoMaloteAfterSubmit(solicitacao.adicionarMaisPedidos, pedido, previous?.colaborador?.nome)
        toast.success(solicitacao.adicionarMaisPedidos ? 'Solicitação enviada. Malote ativo para o próximo pedido.' : 'Solicitação enviada para aprovação.')
        if (pedido && !solicitacao.adicionarMaisPedidos) abrirPedidoCriado(pedido)
        return
      }
      const res = await fetch(`/api/alocacoes/${entidade}/${alocacaoId}`, {
        method: 'DELETE',
      })
      await assertResponseOk(res, 'Erro ao encerrar alocação.')
      toast.success('Alocação encerrada.')
      onRefresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao desalocar.')
    } finally {
      setDesalocandoId(null)
      setConfirmDesalocar(null)
    }
  }

  // Salvar edição de whatsapp (apenas para ramais)
  async function salvarWhatsapp(alocacaoId: string) {
    setSavingWhatsapp(true)
    try {
      if (!isAdmin) {
        const previous = alocacoes.find(aloc => aloc.id === alocacaoId) ?? null
        const solicitacao = await confirmSolicitacao()
        if (!solicitacao.confirmed) return
        const res = await fetch('/api/solicitacoes-inventario', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withPedidoMaloteContext({
            tipo_recurso: 'alocacoes_ramais',
            recurso_id: alocacaoId,
            acao: 'CORRECTION',
            dados_anteriores: previous,
            dados_propostos: { whatsapp: novoWhatsapp },
            comentario: solicitacao.comentario,
          })),
        })
        await assertResponseOk(res, 'Erro ao criar solicitação de atualização.')
        const pedido = await res.json().catch(() => null)
        updatePedidoMaloteAfterSubmit(solicitacao.adicionarMaisPedidos, pedido, previous?.colaborador?.nome)
        toast.success(solicitacao.adicionarMaisPedidos ? 'Solicitação enviada. Malote ativo para o próximo pedido.' : 'Solicitação enviada para aprovação.')
        setEditandoWhatsappId(null)
        if (pedido && !solicitacao.adicionarMaisPedidos) abrirPedidoCriado(pedido)
        return
      }
      const res = await fetch(`/api/alocacoes/${entidade}/${alocacaoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsapp: novoWhatsapp }),
      })
      await assertResponseOk(res, 'Erro ao atualizar.')
      toast.success('WhatsApp atualizado!')
      setEditandoWhatsappId(null)
      onRefresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar.')
    } finally {
      setSavingWhatsapp(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Lista de alocações ativas */}
      {alocacoes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 px-4 py-6 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-white dark:bg-slate-900 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <User className="h-4 w-4 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Sem colaborador alocado</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-lg border border-emerald-100 dark:border-emerald-900/70 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white dark:bg-slate-900 shadow-sm">
                <User className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                {totalAlocacoes} colaborador{totalAlocacoes === 1 ? '' : 'es'} alocado{totalAlocacoes === 1 ? '' : 's'}
              </span>
            </div>
            <span className="rounded-full bg-white/80 dark:bg-slate-900/70 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-100 dark:ring-emerald-900">
              Ativo
            </span>
          </div>

          {alocacoes.map((aloc) => (
            <div
              key={aloc.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-emerald-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-900/70"
            >
              <div className="flex">
                <div className="w-1 bg-emerald-500 shrink-0" />
                <div className="min-w-0 flex-1 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => abrirColaborador(aloc)}
                      disabled={!aloc.colaborador.id}
                      className="group flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:cursor-default"
                      aria-label={`Abrir colaborador ${aloc.colaborador.nome}`}
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 transition group-hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 dark:ring-emerald-900/70 dark:group-hover:bg-emerald-900/60">
                        <User className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start gap-2">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-slate-900 transition group-hover:text-emerald-700 dark:text-slate-100 dark:group-hover:text-emerald-300">
                              {aloc.colaborador.nome}
                            </span>
                            <span className="mt-1 flex flex-wrap gap-1.5">
                              {aloc.colaborador.setor_rel.nome && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-1 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                  <Building2 className="h-3 w-3" />
                                  {aloc.colaborador.setor_rel.nome}
                                </span>
                              )}
                              {aloc.data_inicio && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-1 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                  <CalendarDays className="h-3 w-3" />
                                  Desde {formatDate(aloc.data_inicio)}
                                </span>
                              )}
                              {entidade === 'ramais' && aloc.whatsapp === true && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                  <MessageCircle className="h-3 w-3" />
                                  WhatsApp
                                </span>
                              )}
                            </span>
                          </span>
                          {aloc.colaborador.id && (
                            <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-emerald-500" />
                          )}
                        </span>
                        <span className="mt-2 block text-[11px] font-medium text-slate-400 dark:text-slate-500">
                          Abrir informações do colaborador
                        </span>
                      </span>
                    </button>
                    {(isAdmin || canRequestInventoryChanges) && (
                      <button
                        type="button"
                        onClick={() => setConfirmDesalocar(aloc)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-500 transition hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                      >
                        {desalocandoId === aloc.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <UserMinus className="w-3.5 h-3.5" />
                        }
                        Desalocar
                      </button>
                    )}
                  </div>

                  {aloc.extra && (
                    <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 px-3 py-2">
                      {aloc.extra}
                    </div>
                  )}
                </div>
              </div>

              {/* Edição de WhatsApp para ramais — apenas admin */}
              {(isAdmin || canRequestInventoryChanges) && entidade === 'ramais' && editandoWhatsappId === aloc.id ? (
                <div className="flex items-center gap-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 px-3 py-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={novoWhatsapp}
                      onChange={(e) => setNovoWhatsapp(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600"
                    />
                    <span className="text-xs text-slate-600 dark:text-slate-300">
                      WhatsApp
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => salvarWhatsapp(aloc.id)}
                    disabled={savingWhatsapp}
                    className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded transition disabled:opacity-60"
                  >
                    {savingWhatsapp ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditandoWhatsappId(null)}
                    className="text-xs text-slate-400 hover:text-slate-600 transition"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (isAdmin || canRequestInventoryChanges) && entidade === 'ramais' ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditandoWhatsappId(aloc.id)
                    setNovoWhatsapp(aloc.whatsapp ?? false)
                  }}
                  className="flex w-full items-center justify-center gap-1 border-t border-slate-100 dark:border-slate-800 px-3 py-2 text-xs font-medium text-blue-500 transition hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/30 dark:hover:text-blue-400"
                >
                  <MessageCircle className="h-3 w-3" />
                  Editar WhatsApp
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Adicionar nova alocação — apenas admin */}
      {(isAdmin || canRequestInventoryChanges) && <div className="border border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2 bg-slate-50/60 dark:bg-slate-900/40">
        <div className="flex items-center gap-2">
          <UserPlus className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Adicionar colaborador
          </span>
        </div>
        <ColaboradorSelect
          value={novoColabId}
          onChange={(id, nome) => { setNovoColabId(id); setNovoColabNome(nome) }}
          onClear={() => { setNovoColabId(''); setNovoColabNome('') }}
          selectedNome={novoColabNome}
        />
        {novoColabId && (
          <button
            type="button"
            onClick={alocar}
            disabled={savingNova}
            className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-60 transition"
          >
            {savingNova && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Confirmar alocação
          </button>
        )}
      </div>}

      {/* Confirm desalocar */}
      {confirmDesalocar && (
        <ConfirmDialog
          title="Encerrar alocação"
          description={`Desalocar "${confirmDesalocar.colaborador.nome}"?`}
          onConfirm={() => desalocar(confirmDesalocar.id)}
          onCancel={() => setConfirmDesalocar(null)}
          loading={desalocandoId === confirmDesalocar.id}
        />
      )}
    </div>
  )
}
