'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useCreate } from '@/hooks/use-create'
import { SetorSelect } from './setor-select'
import { LocalidadeSelect } from './localidade-select'
import { AnimatedSheetFrame } from '@/components/layout/motion-primitives'

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
  status: z.boolean().optional(),
})
type FormData = z.infer<typeof schema>

interface Props { onClose: () => void; onRefresh: () => void }

export function CriarImpressoraModal({ onClose, onRefresh }: Props) {
  const { create, saving } = useCreate('impressoras', () => { onRefresh(); onClose() })
  const [setorId, setSetorId] = useState<string | null>(null)
  const [localidadeId, setLocalidadeId] = useState<string | null>(null)
  const { register, handleSubmit } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { status: true },
  })

  const inp = "w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
  const lbl = "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"

  return (
    <AnimatedSheetFrame onClose={onClose}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Nova Impressora</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <form id="criar-imp-form" onSubmit={handleSubmit((data) => create({ ...data, setor_id: setorId, localidade_id: localidadeId }))} noValidate>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Nome Host</label><input {...register('nome_host')} className={inp} /></div>
              <div><label className={lbl}>Fabricante</label><input {...register('fabricante')} className={inp} /></div>
              <div><label className={lbl}>Modelo</label><input {...register('modelo')} className={inp} /></div>
              <div><label className={lbl}>Nº de Série</label><input {...register('numero_serie')} className={inp} /></div>
              <div><label className={lbl}>SELB</label><input {...register('identificador_selb')} className={inp} /></div>
              <div><label className={lbl}>Endereço IP</label><input {...register('endereco_ip')} className={inp} /></div>
              <div><label className={lbl}>Servidor Impressão</label><input {...register('servidor_impressao')} className={inp} /></div>
              <div><label className={lbl}>Andar</label><input {...register('andar')} className={inp} /></div>
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
              <div><label className={lbl}>Tipo de Usuário</label><input {...register('tipo_usuario')} className={inp} /></div>
              <div><label className={lbl}>Última revisão</label><input type="date" {...register('revisao')} className={inp} /></div>
              <div className="flex items-center gap-2 pt-4">
                <input type="checkbox" id="status-imp-criar" {...register('status')} className="w-4 h-4 rounded border-slate-300 text-blue-600" />
                <label htmlFor="status-imp-criar" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">Ativa</label>
              </div>
            </div>
          </form>
        </div>
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">Cancelar</button>
          <button type="submit" form="criar-imp-form" disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60 transition">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Criar impressora
          </button>
        </div>
    </AnimatedSheetFrame>
  )
}
