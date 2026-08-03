'use client'
import { usePermission } from '@/hooks/use-permission'

import { useState } from 'react'
import { X, Pencil, Trash2, Loader2, UserPlus } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { BoolBadge } from '@/components/dashboard/status-badge'
import { DetailField, DetailSection } from '@/components/modals/detail-field'
import { ConfirmDialog } from '@/components/modals/confirm-dialog'
import { ColaboradorSelect } from '@/components/modals/colaborador-select'
import { useCrud } from '@/hooks/use-crud'
import { mapTipoAparelho } from '@/lib/utils'
import type { Aparelho } from '@/types'
import { HistoricoPanel } from './historico-panel'
import { AlocacoesAtivasSection } from './alocacoes-ativas-section'
import { SetorSelect } from './setor-select'
import { LocalidadeSelect } from './localidade-select'
import { AnimatedDialogFrame } from '@/components/layout/motion-primitives'
import { DeviceCommentsPopover } from '@/components/forum/device-comments-popover'
import { useSolicitacaoInventarioConfirm } from '@/components/solicitacoes-inventario/solicitacao-confirm-provider'
import { updatePedidoMaloteAfterSubmit, withPedidoMaloteContext } from '@/lib/solicitacoes-inventario-client'

const schema = z.object({
  modelo: z.string().optional().nullable(),
  endereco_ip: z.string().optional().nullable(),
  endereco_mac: z.string().optional().nullable(),
  chip: z.boolean().optional().nullable(),
  status: z.boolean().optional().nullable(),
})
type FormData = z.infer<typeof schema>

interface Props {
  aparelho: Aparelho
  onClose: () => void
  onRefresh: () => void
}

async function assertResponseOk(res: Response, fallback: string) {
  if (res.ok) return
  const json = await res.json().catch(() => ({}))
  throw new Error(typeof json.error === 'string' && json.error.trim() ? json.error : fallback)
}

export function AparelhoModal({ aparelho, onClose, onRefresh }: Props) {
  const { isAdmin, canRequestInventoryChanges } = usePermission()
  const confirmSolicitacao = useSolicitacaoInventarioConfirm()
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showDesalocarConfirm, setShowDesalocarConfirm] = useState(false)
  const [colabId, setColabId] = useState('')
  const [colabNome, setColabNome] = useState('')
  const [savingAlocacao, setSavingAlocacao] = useState(false)
  const [setorId, setSetorId] = useState<string | null>(
    aparelho.setor_id ?? null
  )
  const [localidadeId, setLocalidadeId] = useState<string | null>(
    aparelho.localidade_id ?? null
  )

  const { update, remove, saving, deleting } = useCrud('aparelhos', () => {
    onRefresh()
    onClose()
  })

  const { register, handleSubmit } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      modelo: aparelho.modelo,
      endereco_ip: aparelho.endereco_ip,
      endereco_mac: aparelho.endereco_mac,
      chip: aparelho.chip,
      status: aparelho.status,
    },
  })

  function onSubmit(data: FormData) {
  update(aparelho.id, { ...data, setor_id: setorId, localidade_id: localidadeId }, {
    previousData: aparelho,
    label: `Aparelho "${aparelho.modelo}" atualizado`,
  })
}

  async function alocar() {
    if (!colabId) return
    setSavingAlocacao(true)
    try {
      if (!isAdmin) {
        const solicitacao = await confirmSolicitacao()
    if (!solicitacao.confirmed) return
        const res = await fetch('/api/solicitacoes-inventario', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withPedidoMaloteContext({
            tipo_recurso: 'alocacoes_aparelhos',
            acao: 'ALLOCATE',
            dados_propostos: { aparelho_id: aparelho.id, colaborador_id: colabId },
            comentario: solicitacao.comentario,
          })),
        })
        await assertResponseOk(res, 'Erro ao criar solicitação de alocação.')
        const pedido = await res.json().catch(() => null)
        updatePedidoMaloteAfterSubmit(solicitacao.adicionarMaisPedidos, pedido, aparelho.modelo ?? aparelho.endereco_ip)
        toast.success(solicitacao.adicionarMaisPedidos ? 'Solicitação enviada. Malote ativo para o próximo pedido.' : 'Solicitação enviada para aprovação.')
        if (!solicitacao.adicionarMaisPedidos) onClose()
        return
      }
      const res = await fetch('/api/alocacoes/aparelhos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aparelho_id: aparelho.id, colaborador_id: colabId }),
      })
      await assertResponseOk(res, 'Erro ao alocar aparelho.')
      toast.success('Aparelho alocado com sucesso!')
      onRefresh()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao alocar.')
    } finally {
      setSavingAlocacao(false)
    }
  }

  async function desalocar() {
    setSavingAlocacao(true)
    try {
      if (!isAdmin) {
        const activeId = aparelho.alocacoes_ativas?.[0]?.id
        if (!activeId) throw new Error('Nenhuma alocação ativa encontrada.')
        const solicitacao = await confirmSolicitacao()
    if (!solicitacao.confirmed) return
        const res = await fetch('/api/solicitacoes-inventario', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withPedidoMaloteContext({
            tipo_recurso: 'alocacoes_aparelhos',
            recurso_id: activeId,
            acao: 'DEALLOCATE',
            dados_anteriores: aparelho.alocacoes_ativas?.[0] ?? null,
            dados_propostos: {},
      comentario: solicitacao.comentario,
          })),
        })
        await assertResponseOk(res, 'Erro ao criar solicitação de desalocação.')
        const pedido = await res.json().catch(() => null)
        updatePedidoMaloteAfterSubmit(solicitacao.adicionarMaisPedidos, pedido, aparelho.modelo ?? aparelho.endereco_ip)
        toast.success(solicitacao.adicionarMaisPedidos ? 'Solicitação enviada. Malote ativo para o próximo pedido.' : 'Solicitação enviada para aprovação.')
        if (!solicitacao.adicionarMaisPedidos) onClose()
        return
      }
      const res = await fetch(`/api/alocacoes/aparelhos/${aparelho.id}/ativo`, { method: 'DELETE' })
      await assertResponseOk(res, 'Erro ao desalocar aparelho.')
      toast.success('Alocação encerrada.')
      onRefresh()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao desalocar.')
    } finally {
      setSavingAlocacao(false)
    }
  }

  const inp = "w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
  const lbl = "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"

  return (
    <>
      <DeviceCommentsPopover
        tipoItem="aparelhos"
        itemId={aparelho.id}
        itemLabel={aparelho.modelo ?? aparelho.endereco_ip}
      />
      <AnimatedDialogFrame onClose={onClose} className="flex max-h-[90vh] max-w-4xl flex-col rounded-2xl">

          <div className="flex items-start justify-between p-5 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {mode === 'edit' ? 'Editar Aparelho' : (aparelho.modelo || 'Aparelho')}
              </h2>
              {mode === 'view' && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  {mapTipoAparelho(aparelho.tipo)}
                </p>
              )}
            </div>
            <button type="button" onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
              <X className="w-4 h-4" />
            </button>
          </div>

          {mode === 'view' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {aparelho.alocacao_ativa ? (
                <AlocacoesAtivasSection
                  itemId={aparelho.id}
                  entidade="aparelhos"
                  alocacoes={(aparelho.alocacoes_ativas ?? []).map(a => ({
                    id: a.id,
                    colaborador: {
                      id: a.colaborador.id,
                      nome: a.colaborador.nome,
                      setor_rel: {
                        nome: a.colaborador.setor_rel?.nome ?? null,
                      },
                    },
                    data_inicio: a.data_inicio ?? null,
                  }))}
                  onRefresh={onRefresh}
                  onClose={onClose}
                />
              ) : (
                (isAdmin || canRequestInventoryChanges) && (
                  <div className="border border-dashed border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Alocar Colaborador</span>
                  </div>
                  <ColaboradorSelect
                    value={colabId}
                    onChange={(id, nome) => { setColabId(id); setColabNome(nome) }}
                    onClear={() => { setColabId(''); setColabNome('') }}
                    selectedNome={colabNome}
                  />
                  {colabId && (
                    <button type="button" onClick={alocar} disabled={savingAlocacao}
                      className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-60 transition">
                      {savingAlocacao && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Confirmar alocação
                    </button>
                  )}
                </div>
                )
              )}

              <DetailSection title="Identificação">
                <DetailField label="Modelo" value={aparelho.modelo} />
                <DetailField label="Tipo" value={mapTipoAparelho(aparelho.tipo)} />
                <DetailField label="Status" value={<BoolBadge value={aparelho.status} labelTrue="Ativo" labelFalse="Inativo" />} />
                <DetailField label="Chip" value={<BoolBadge value={aparelho.chip} />} />
              </DetailSection>
              <DetailSection title="Rede">
                <DetailField label="Endereço IP" value={aparelho.endereco_ip} />
                <DetailField label="Endereço MAC" value={aparelho.endereco_mac} />
                <DetailField label="Setor" value={aparelho.setor_nome ?? '—'} />
                <DetailField label="Localidade" value={aparelho.localidade_nome ?? '—'} />
              </DetailSection>
              <HistoricoPanel registroId={aparelho.id} tabela="aparelhos" />
            </div>
          )}

          {mode === 'edit' && (
            <div className="flex-1 overflow-y-auto p-5">
              <form id="ap-form" onSubmit={(e) => { e.preventDefault(); handleSubmit(onSubmit)(e) }} noValidate>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className={lbl}>Modelo</label>
                    <input {...register('modelo')} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Endereço IP</label>
                    <input {...register('endereco_ip')} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Endereço MAC</label>
                    <input {...register('endereco_mac')} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Setor</label>
                    <SetorSelect
                      value={setorId}
                      onChange={(id) => setSetorId(id)}
                    />
                  </div>
                  <div>
                    <label className={lbl}>Localidade</label>
                    <LocalidadeSelect
                      value={localidadeId}
                      onChange={(id) => { setLocalidadeId(id) }}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <input type="checkbox" id="chip-edit" {...register('chip')}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    <label htmlFor="chip-edit" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">Com chip</label>
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <input type="checkbox" id="status-edit" {...register('status')}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    <label htmlFor="status-edit" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">Ativo</label>
                  </div>
                </div>
              </form>
            </div>
          )}

          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex gap-2">
            {mode === 'view' ? (
              <>
{(isAdmin || canRequestInventoryChanges) && (                <button type="button" onClick={(e) => {e.preventDefault(); setShowDeleteConfirm(true)}}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition">
                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                </button>)}
{(isAdmin || canRequestInventoryChanges) && (                <button type="button" onClick={(e) => {e.preventDefault(); setMode('edit')}}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition">
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </button>)}
              </>
            ) : (
              <>
                <button type="button" onClick={(e) => {e.preventDefault(); setMode('view')}}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                  Cancelar
                </button>
                <button type="submit" form="ap-form" disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60 transition">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Salvar alterações
                </button>
              </>
            )}
          </div>
      </AnimatedDialogFrame>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Excluir aparelho"
          description={`Excluir "${aparelho.modelo}"? Esta ação não pode ser desfeita.`}
          onConfirm={() => remove(aparelho.id)}
          onCancel={() => setShowDeleteConfirm(false)}
          loading={deleting}
        />
      )}

      {showDesalocarConfirm && (
        <ConfirmDialog
          title="Encerrar alocação"
          description={`Desalocar "${aparelho.alocacao_ativa?.colaborador.nome}" deste aparelho?`}
          onConfirm={desalocar}
          onCancel={() => setShowDesalocarConfirm(false)}
          loading={savingAlocacao}
        />
      )}
    </>
  )
}
