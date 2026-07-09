'use client'
import { usePermission } from '@/hooks/use-permission'

import { useState } from 'react'
import { X, Pencil, Trash2, Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { BoolBadge } from '@/components/dashboard/status-badge'
import { DetailField, DetailSection } from '@/components/modals/detail-field'
import { ConfirmDialog } from '@/components/modals/confirm-dialog'
import { useCrud } from '@/hooks/use-crud'
import { formatDate } from '@/lib/utils'
import type { Impressora } from '@/types'
import { SetorSelect } from './setor-select'
import { LocalidadeSelect } from './localidade-select'
import { AnimatedSheetFrame } from '@/components/layout/motion-primitives'
import { DeviceCommentsPopover } from '@/components/forum/device-comments-popover'

const schema = z.object({
  nome_host: z.string().optional().nullable(),
  fabricante: z.string().optional().nullable(),
  modelo: z.string().optional().nullable(),
  numero_serie: z.string().optional().nullable(),
  identificador_selb: z.string().optional().nullable(),
  endereco_ip: z.string().optional().nullable(),
  andar: z.string().optional().nullable(),
  servidor_impressao: z.string().optional().nullable(),
  tipo_usuario: z.string().optional().nullable(),
  revisao: z.string().optional().nullable(),
  status: z.boolean().optional().nullable(),
})
type FormData = z.infer<typeof schema>

interface Props { impressora: Impressora; onClose: () => void; onRefresh: () => void }

function toDateInputValue(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

export function ImpressoraModal({ impressora, onClose, onRefresh }: Props) {
  const { isAdmin, canRequestInventoryChanges } = usePermission()
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [setorId, setSetorId] = useState<string | null>(
    impressora.setor_id ?? null
  )
  const [localidadeId, setLocalidadeId] = useState<string | null>(
    impressora.localidade_id ?? null
  )

  const { update, remove, saving, deleting } = useCrud('impressoras', () => {
    onRefresh()
    onClose()
  })

  const { register, handleSubmit } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      nome_host: impressora.nome_host,
      fabricante: impressora.fabricante,
      modelo: impressora.modelo,
      numero_serie: impressora.numero_serie,
      identificador_selb: impressora.identificador_selb,
      endereco_ip: impressora.endereco_ip,
      andar: impressora.andar,
      servidor_impressao: impressora.servidor_impressao,
      tipo_usuario: impressora.tipo_usuario,
      revisao: toDateInputValue(impressora.revisao),
      status: impressora.status,
    },
  })

  function onSubmit(data: FormData) {
  const currentRevision = toDateInputValue(impressora.revisao)
  const { revisao, ...baseData } = data
  const payload = {
    ...baseData,
    ...(revisao !== currentRevision ? { revisao: revisao || null } : {}),
    setor_id: setorId,
    localidade_id: localidadeId,
  }

  update(impressora.id, payload, {
    previousData: impressora,
    label: `Impressora "${impressora.nome_host ?? impressora.modelo }" atualizada`,
  })
}


  const inp = "w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
  const lbl = "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"

  return (
    <>
      <DeviceCommentsPopover
        tipoItem="impressoras"
        itemId={impressora.id}
        itemLabel={impressora.nome_host ?? impressora.modelo ?? impressora.numero_serie}
      />
      <AnimatedSheetFrame onClose={onClose}>

          <div className="flex items-start justify-between p-5 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {mode === 'edit' ? 'Editar Impressora' : (impressora.nome_host || 'Impressora')}
              </h2>
              {mode === 'view' && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  {impressora.fabricante} {impressora.modelo}
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
              <DetailSection title="Identificação">
                <DetailField label="Nome Host" value={impressora.nome_host} />
                <DetailField label="Fabricante" value={impressora.fabricante} />
                <DetailField label="Modelo" value={impressora.modelo} />
                <DetailField label="Nº de Série" value={impressora.numero_serie} />
                <DetailField label="SELB" value={impressora.identificador_selb} />
                <DetailField label="Status" value={<BoolBadge value={impressora.status} labelTrue="Ativo" labelFalse="Inativo" />} />
              </DetailSection>
              <DetailSection title="Rede e Localização">
                <DetailField label="Endereço IP" value={impressora.endereco_ip} />
                <DetailField label="Servidor Impressão" value={impressora.servidor_impressao} />
                <DetailField label="Andar" value={impressora.andar} />
                <DetailField label="Setor" value={impressora.setor_nome ?? '—'} />
                <DetailField label="Localidade" value={impressora.localidade_nome ?? impressora.localidade ?? '—'} />
                <DetailField label="Tipo de Usuário" value={impressora.tipo_usuario} />
                <DetailField label="Revisão" value={formatDate(impressora.revisao)} />
              </DetailSection>
            </div>
          )}

          {mode === 'edit' && (
            <div className="flex-1 overflow-y-auto p-5">
              <form id="imp-form" onSubmit={(e) => { e.preventDefault(); handleSubmit(onSubmit)(e) }} noValidate>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={lbl}>Nome Host</label><input {...register('nome_host')} className={inp} /></div>
                  <div><label className={lbl}>Fabricante</label><input {...register('fabricante')} className={inp} /></div>
                  <div><label className={lbl}>Modelo</label><input {...register('modelo')} className={inp} /></div>
                  <div><label className={lbl}>Nº de Série</label><input {...register('numero_serie')} className={inp} /></div>
                  <div><label className={lbl}>SELB</label><input {...register('identificador_selb')} className={inp} /></div>
                  <div><label className={lbl}>Endereço IP</label><input {...register('endereco_ip')} className={inp} /></div>
                  <div><label className={lbl}>Servidor Impressão</label><input {...register('servidor_impressao')} className={inp} /></div>
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
                  <div><label className={lbl}>Andar</label><input {...register('andar')} className={inp} /></div>
                  <div><label className={lbl}>Tipo de Usuário</label><input {...register('tipo_usuario')} className={inp} /></div>
                  <div><label className={lbl}>Última revisão</label><input type="date" {...register('revisao')} className={inp} /></div>
                  <div className="flex items-center gap-2 pt-4">
                    <input type="checkbox" id="imp-status" {...register('status')}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    <label htmlFor="imp-status" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">Ativo</label>
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
                <button type="submit" form="imp-form" disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60 transition">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Salvar alterações
                </button>
              </>
            )}
          </div>
      </AnimatedSheetFrame>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Excluir impressora"
          description={`Excluir "${impressora.nome_host}"? Esta ação não pode ser desfeita.`}
          onConfirm={() => remove(impressora.id)}
          onCancel={() => setShowDeleteConfirm(false)}
          loading={deleting}
        />
      )}
    </>
  )
}
