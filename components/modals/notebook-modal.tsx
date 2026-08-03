"use client";
import { usePermission } from "@/hooks/use-permission";

import { useState } from "react";
import { X, Pencil, Trash2, Loader2, UserPlus, Box } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CategoriaBadge } from "@/components/dashboard/status-badge";
import { DetailField, DetailSection } from "@/components/modals/detail-field";
import { ConfirmDialog } from "@/components/modals/confirm-dialog";
import { ColaboradorSelect } from "@/components/modals/colaborador-select";
import { useCrud } from "@/hooks/use-crud";
import type { Notebook } from "@/types";
import { HistoricoPanel } from "./historico-panel";
import { AlocacoesAtivasSection } from "./alocacoes-ativas-section";
import { SetorSelect } from "./setor-select";
import { LocalidadeSelect } from "./localidade-select";
import { formatDate } from "@/lib/utils";
import { AnimatedDialogFrame } from "@/components/layout/motion-primitives";
import { DeviceCommentsPopover } from "@/components/forum/device-comments-popover";
import { useSolicitacaoInventarioConfirm } from "@/components/solicitacoes-inventario/solicitacao-confirm-provider";
import { updatePedidoMaloteAfterSubmit, withPedidoMaloteContext } from '@/lib/solicitacoes-inventario-client'

const schema = z.object({
 modelo: z.string().optional().nullable(),
 fabricante: z.string().optional().nullable(),
 categoria: z.enum(["Administrativa", "Academica"]).optional().nullable(),
 processador: z.string().optional().nullable(),
 memoria: z.string().optional().nullable(),
 armazenamento: z.string().optional().nullable(),
 numero_patrimonio: z.string().optional().nullable(),
 emprestado_setor_id: z.string().optional().nullable(),
 emprestado_colaborador_id: z.string().optional().nullable(),
 emprestado_obs: z.string().optional().nullable(),
});
type FormData = z.infer<typeof schema>;

interface Props {
 notebook: Notebook;
 onClose: () => void;
 onRefresh: () => void;
}

async function assertResponseOk(res: Response, fallback: string) {
 if (res.ok) return
 const json = await res.json().catch(() => ({}))
 throw new Error(typeof json.error === 'string' && json.error.trim() ? json.error : fallback)
}

export function NotebookModal({ notebook, onClose, onRefresh }: Props) {
 const { isAdmin, canRequestInventoryChanges } = usePermission();
 const confirmSolicitacao = useSolicitacaoInventarioConfirm()
 const [mode, setMode] = useState<"view" | "edit">("view");
 const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
 const [showDesalocarConfirm, setShowDesalocarConfirm] = useState(false);
 const [colabId, setColabId] = useState("");
 const [colabNome, setColabNome] = useState("");
 const [savingAlocacao, setSavingAlocacao] = useState(false);

 // Estado para edição de empréstimo:
 const [editandoEmprestimo, setEditandoEmprestimo] = useState(false);
 const [empSetorId, setEmpSetorId] = useState<string | null>(
  notebook.emprestado_setor_id ?? null,
 );
 const [empColabId, setEmpColabId] = useState<string | null>(
  notebook.emprestado_colaborador_id ?? null,
 );
 const [empColabNome, setEmpColabNome] = useState<string | null>(null);
 const [empObs, setEmpObs] = useState(notebook.emprestado_obs ?? "");
 const [savingEmp, setSavingEmp] = useState(false);

 const [setorId, setSetorId] = useState<string | null>(
    notebook.setor_id ?? null
  )
 const [localidadeId, setLocalidadeId] = useState<string | null>(
    notebook.localidade_id ?? null
  )

 const { update, remove, saving, deleting } = useCrud("notebooks", () => {
  onRefresh();
  onClose();
 });

 const { register, handleSubmit } = useForm<FormData>({
  resolver: zodResolver(schema),
  defaultValues: {
   modelo: notebook.modelo,
   fabricante: notebook.fabricante,
   categoria: notebook.categoria,
   processador: notebook.processador,
   memoria: notebook.memoria,
   armazenamento: notebook.armazenamento,
   numero_patrimonio: notebook.numero_patrimonio,
  },
 });

 // Chamado APENAS pelo botão type="submit" form="nb-form"
 function onSubmit(data: FormData) {
  update(notebook.id, { ...data, setor_id: setorId, localidade_id: localidadeId }, {
    previousData: notebook,
    label: `Notebook "${notebook.numero_patrimonio}" atualizado`,
  })
}

 async function alocar() {
  if (!colabId) return;
  setSavingAlocacao(true);
  try {
   if (!isAdmin) {
    const solicitacao = await confirmSolicitacao()
    if (!solicitacao.confirmed) return
    const res = await fetch('/api/solicitacoes-inventario', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(withPedidoMaloteContext({
      tipo_recurso: 'alocacoes_notebooks',
      acao: 'ALLOCATE',
      dados_propostos: { notebook_id: notebook.id, colaborador_id: colabId },
      comentario: solicitacao.comentario,
     })),
    })
    await assertResponseOk(res, 'Erro ao criar solicitação de alocação.')
    const pedido = await res.json().catch(() => null)
    updatePedidoMaloteAfterSubmit(solicitacao.adicionarMaisPedidos, pedido, notebook.numero_patrimonio ?? notebook.modelo)
    toast.success(solicitacao.adicionarMaisPedidos ? 'Solicitação enviada. Malote ativo para o próximo pedido.' : 'Solicitação enviada para aprovação.')
    if (!solicitacao.adicionarMaisPedidos) onClose()
    return
   }
   const res = await fetch("/api/alocacoes/notebooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notebook_id: notebook.id, colaborador_id: colabId }),
   });
   await assertResponseOk(res, 'Erro ao alocar notebook.');
   toast.success("Notebook alocado com sucesso!");
   onRefresh();
   onClose();
  } catch (error) {
   toast.error(error instanceof Error ? error.message : "Erro ao alocar.");
  } finally {
   setSavingAlocacao(false);
  }
 }

 async function desalocar() {
  setSavingAlocacao(true);
  try {
   if (!isAdmin) {
    const activeId = notebook.alocacoes_ativas?.[0]?.id
    if (!activeId) throw new Error('Nenhuma alocação ativa encontrada.')
    const solicitacao = await confirmSolicitacao()
    if (!solicitacao.confirmed) return
    const res = await fetch('/api/solicitacoes-inventario', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(withPedidoMaloteContext({
      tipo_recurso: 'alocacoes_notebooks',
      recurso_id: activeId,
      acao: 'DEALLOCATE',
      dados_anteriores: notebook.alocacoes_ativas?.[0] ?? null,
      dados_propostos: {},
      comentario: solicitacao.comentario,
     })),
    })
    await assertResponseOk(res, 'Erro ao criar solicitação de desalocação.')
    const pedido = await res.json().catch(() => null)
    updatePedidoMaloteAfterSubmit(solicitacao.adicionarMaisPedidos, pedido, notebook.numero_patrimonio ?? notebook.modelo)
    toast.success(solicitacao.adicionarMaisPedidos ? 'Solicitação enviada. Malote ativo para o próximo pedido.' : 'Solicitação enviada para aprovação.')
    if (!solicitacao.adicionarMaisPedidos) onClose()
    return
   }
   const res = await fetch(`/api/alocacoes/notebooks/${notebook.id}/ativo`, {
    method: "DELETE",
   });
   await assertResponseOk(res, 'Erro ao desalocar notebook.');
   toast.success("Alocação encerrada.");
   onRefresh();
   onClose();
  } catch (error) {
   toast.error(error instanceof Error ? error.message : "Erro ao desalocar.");
  } finally {
   setSavingAlocacao(false);
  }
 }

 async function salvarEmprestimo(ativo: boolean) {
  setSavingEmp(true);
  try {
   if (ativo && !empSetorId) {
    toast.error("Selecione um setor de destino");
    setSavingEmp(false);
    return;
   }
   if (!notebook.id) {
    toast.error("Erro: ID do notebook não disponível");
    setSavingEmp(false);
    return;
   }
   console.log("Salvando empréstimo para notebook ID:", notebook.id);
   const res = await fetch(`/api/notebooks/${notebook.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
     ativo
      ? {
         emprestado: true,
         emprestado_setor_id: empSetorId,
         emprestado_colaborador_id: empColabId,
         emprestado_obs: empObs,
         emprestado_desde: new Date().toISOString().split("T")[0],
        }
      : {
         emprestado: false,
         emprestado_setor_id: null,
         emprestado_colaborador_id: null,
         emprestado_obs: null,
         emprestado_desde: null,
        },
    ),
   });
   if (!res.ok) {
    const error = await res
     .json()
     .catch(() => ({ error: "Erro desconhecido" }));
    throw new Error(error.error || `Erro ${res.status}`);
   }
   toast.success(ativo ? "Empréstimo registrado!" : "Empréstimo encerrado!");
   setEditandoEmprestimo(false);
   onRefresh();
  } catch (err) {
   const message =
    err instanceof Error ? err.message : "Erro ao salvar empréstimo.";
   toast.error(message);
  } finally {
   setSavingEmp(false);
  }
 }

 const inp =
  "w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500";
 const lbl =
  "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1";

 return (
  <>
   <DeviceCommentsPopover
    tipoItem="notebooks"
    itemId={notebook.id}
    itemLabel={notebook.modelo ?? notebook.numero_patrimonio}
   />
   <AnimatedDialogFrame onClose={onClose} className="flex max-h-[90vh] max-w-4xl flex-col rounded-2xl">
     {/* Header */}
     <div className="flex items-start justify-between p-5 border-b border-slate-100 dark:border-slate-800">
      <div>
       <h2 className="text-base font-semibold text-slate-900 dark:text-white">
        {mode === "edit" ? "Editar Notebook" : notebook.modelo || "Notebook"}
       </h2>
       {mode === "view" && (
        <div className="flex items-center gap-2 mt-1">
         <CategoriaBadge categoria={notebook.categoria} />
         {notebook.numero_patrimonio && (
          <span className="text-xs text-slate-400">
           {notebook.numero_patrimonio}
          </span>
         )}
        </div>
       )}
      </div>
      <button
       type="button"
       onClick={onClose}
       className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
      >
       <X className="w-4 h-4" />
      </button>
     </div>

     {/* Body — modo view */}
     {mode === "view" && (
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
       {/* Alocação ativa */}
       {notebook.alocacao_ativa ? (
        <AlocacoesAtivasSection
         itemId={notebook.id}
         entidade="notebooks"
         alocacoes={(notebook.alocacoes_ativas ?? []).map((a) => ({
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
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
           Alocar Colaborador
          </span>
         </div>
         <ColaboradorSelect
          value={colabId}
          onChange={(id, nome) => {
           setColabId(id);
           setColabNome(nome);
          }}
          onClear={() => {
           setColabId("");
           setColabNome("");
          }}
          selectedNome={colabNome}
         />
         {colabId && (
          <button
           type="button"
           onClick={(e) => {
            e.preventDefault();
            alocar();
           }}
           disabled={savingAlocacao}
           className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-60 transition"
          >
           {savingAlocacao && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
           Confirmar alocação
          </button>
         )}
        </div>
        )
       )}

       <DetailSection title="Identificação">
        <DetailField label="Modelo" value={notebook.modelo} />
        <DetailField label="Fabricante" value={notebook.fabricante} />
        <DetailField label="Nº Patrimônio" value={notebook.numero_patrimonio} />
        <DetailField
         label="Categoria"
         value={<CategoriaBadge categoria={notebook.categoria} />}
        />
       </DetailSection>
       <DetailSection title="Hardware">
        <DetailField label="Processador" value={notebook.processador} />
        <DetailField label="Memória" value={notebook.memoria} />
        <DetailField label="Armazenamento" value={notebook.armazenamento} />
        <DetailField label="Última revisão" value={formatDate(notebook.data_revisao)} />
        <DetailField label="Setor" value={notebook.setor_nome ?? '—'} />
        <DetailField label="Localidade" value={notebook.localidade_nome ?? '—'} />
       </DetailSection>
       {notebook.emprestado ? (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg p-4">
         <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
           📦 Emprestado
          </span>
          {(isAdmin || canRequestInventoryChanges) && (
           <button
            type="button"
            onClick={() => salvarEmprestimo(false)}
            disabled={savingEmp}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-500 transition hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40 dark:hover:text-red-400"
           >
            <Box /> Encerrar empréstimo
           </button>
          )}
         </div>
         {notebook.emprestado_colaborador_id && (
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
           {/* Nome do colaborador — buscar via colaborador_select ou exibir ID */}
           Colaborador vinculado:{" "}
           {notebook.emprestado_colaborador_nome ??
            notebook.emprestado_colaborador_setor ??
            "Emprestado"}
          </p>
         )}
         {notebook.emprestado_obs && (
          <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
           {notebook.emprestado_obs}
          </p>
         )}
         {notebook.emprestado_desde && (
          <p className="text-xs text-amber-500 dark:text-amber-600">
           Desde: {formatDate(String(notebook.emprestado_desde))}
          </p>
         )}
        </div>
       ) : !editandoEmprestimo ? (
        (isAdmin || canRequestInventoryChanges) && (
         <button
          type="button"
          onClick={() => setEditandoEmprestimo(true)}
          className="w-full py-2 text-xs font-medium rounded-lg border border-dashed border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 hover:border-amber-400 dark:hover:border-amber-600 transition"
         >
          + Registrar empréstimo
         </button>
        )
       ) : (
        (isAdmin || canRequestInventoryChanges) && (
         <div className="border border-amber-100 dark:border-amber-900 rounded-lg p-4 space-y-3 bg-amber-50/50 dark:bg-amber-950/20">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
           Registrar Empréstimo
          </p>
          <div>
           <label className="block text-xs text-slate-500 mb-1">
            Setor de destino
           </label>
           <SetorSelect
            value={empSetorId}
            onChange={(id) => setEmpSetorId(id)}
           />
          </div>
          <div>
           <label className="block text-xs text-slate-500 mb-1">
            Colaborador (opcional)
           </label>
           <ColaboradorSelect
            value={empColabId ?? ""}
            onChange={(id, nome) => {
             setEmpColabId(id);
             setEmpColabNome(nome);
            }}
            onClear={() => {
             setEmpColabId(null);
             setEmpColabNome(null);
            }}
            selectedNome={empColabNome}
           />
          </div>
          <div>
           <label className="block text-xs text-slate-500 mb-1">
            Observação
           </label>
           <input
            type="text"
            value={empObs}
            onChange={(e) => setEmpObs(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Motivo do empréstimo..."
           />
          </div>
          <div className="flex gap-2">
           <button
            type="button"
            onClick={() => setEditandoEmprestimo(false)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
           >
            Cancelar
           </button>
           <button
            type="button"
            onClick={() => salvarEmprestimo(true)}
            disabled={savingEmp}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-lg bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-60 transition"
           >
            {savingEmp && <Loader2 className="w-3 h-3 animate-spin" />}
            Confirmar empréstimo
           </button>
          </div>
         </div>
        )
       )}
       <HistoricoPanel registroId={notebook.id} tabela="notebooks" />
      </div>
     )}

     {/* Body — modo edit */}
     {mode === "edit" && (
      <div className="flex-1 overflow-y-auto p-5">
       <form
        id="nb-form"
        onSubmit={(e) => {
         e.preventDefault();
         handleSubmit(onSubmit)(e);
        }}
        noValidate
       >
        <div className="grid grid-cols-2 gap-3">
         <div>
          <label className={lbl}>Modelo</label>
          <input {...register("modelo")} className={inp} />
         </div>
         <div>
          <label className={lbl}>Fabricante</label>
          <input {...register("fabricante")} className={inp} />
         </div>
         <div className="col-span-2">
          <label className={lbl}>Categoria</label>
          <select {...register("categoria")} className={inp}>
           <option value="">Selecione...</option>
           <option value="Administrativa">Administrativa</option>
           <option value="Academica">Acadêmica</option>
          </select>
         </div>
         <div>
          <label className={lbl}>Processador</label>
          <input {...register("processador")} className={inp} />
         </div>
         <div>
          <label className={lbl}>Memória</label>
          <input {...register("memoria")} className={inp} />
         </div>
         <div>
          <label className={lbl}>Armazenamento</label>
          <input {...register("armazenamento")} className={inp} />
         </div>
         <div>
          <label className={lbl}>Nº Patrimônio</label>
          <input {...register("numero_patrimonio")} className={inp} />
        </div>
        <div className="col-span-2">
         <label className={lbl}>Setor</label>
         <SetorSelect value={setorId} onChange={(id) => setSetorId(id)} />
        </div>
         <div className="col-span-2">
          <label className={lbl}>Localidade</label>
          <LocalidadeSelect
           value={localidadeId}
           onChange={(id) => { setLocalidadeId(id) }}
          />
         </div>
        </div>
       </form>
      </div>
     )}

     {/* Footer */}
     <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex gap-2">
      {mode === "view" ? (
       <>
        {(isAdmin || canRequestInventoryChanges) && (
         <button
          type="button"
          onClick={(e) => {
           e.preventDefault();
           setShowDeleteConfirm(true);
          }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition"
         >
          <Trash2 className="w-3.5 h-3.5" /> Excluir
         </button>
        )}
        {(isAdmin || canRequestInventoryChanges) && (
         <button
          type="button"
          onClick={(e) => {
           e.preventDefault();
           setMode("edit");
          }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition"
         >
          <Pencil className="w-3.5 h-3.5" /> Editar
         </button>
        )}
       </>
      ) : (
       <>
        <button
         type="button"
         onClick={(e) => {
          e.preventDefault();
          setMode("view");
         }}
         className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
        >
         Cancelar
        </button>
        {/* type="submit" + form="nb-form" — única forma de disparar o handleSubmit */}
        <button
         type="submit"
         form="nb-form"
         disabled={saving}
         className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60 transition"
        >
         {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
         Salvar alterações
        </button>
       </>
      )}
     </div>
   </AnimatedDialogFrame>

   {showDeleteConfirm && (
    <ConfirmDialog
     title="Excluir notebook"
     description={`Excluir "${notebook.modelo}"? Esta ação não pode ser desfeita.`}
     onConfirm={() => remove(notebook.id)}
     onCancel={() => setShowDeleteConfirm(false)}
     loading={deleting}
    />
   )}

   {showDesalocarConfirm && (
    <ConfirmDialog
     title="Encerrar alocação"
     description={`Desalocar "${notebook.alocacao_ativa?.colaborador.nome}" deste notebook?`}
     onConfirm={desalocar}
     onCancel={() => setShowDesalocarConfirm(false)}
     loading={savingAlocacao}
    />
   )}
  </>
 );
}
