"use client";
import { usePermission } from "@/hooks/use-permission";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Pencil, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { DetailField, DetailSection } from "@/components/modals/detail-field";
import { ConfirmDialog } from "@/components/modals/confirm-dialog";
import { HistoricoPanel } from "@/components/modals/historico-panel";
import { ColaboradorAlocacoes } from "@/components/modals/colaborador-alocacoes";
import { useCrud } from "@/hooks/use-crud";
import { formatDate } from "@/lib/utils";
import type { Colaborador } from "@/types";
import { withPedidoMaloteContext } from '@/lib/solicitacoes-inventario-client'
import { SetorSelect } from "./setor-select";
import { LocalidadeSelect } from "./localidade-select";
import { toast } from "sonner";
import { AnimatedDialogFrame, AnimatedSheetFrame } from "@/components/layout/motion-primitives";
import { writePendingInspectPreview } from "@/lib/navigation-context";

const schema = z.object({
 nome: z.string().min(1, "Nome obrigatório"),
 codigo: z.union([z.number(), z.null()]).optional(),
 status: z.enum(["Ativo", "Inativo"]),
});
type FormData = z.infer<typeof schema>;

interface Props {
 colaborador: Colaborador;
 onClose: () => void;
 onRefresh: () => void;
}

type Tab = "info" | "alocacoes" | "historico";

export function ColaboradorModal({ colaborador, onClose, onRefresh }: Props) {
 const { isAdmin, canRequestInventoryChanges } = usePermission();
 const router = useRouter();
 const [mode, setMode] = useState<"view" | "edit">("view");
 const [tab, setTab] = useState<Tab>("info");
 const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
 const [setorId, setSetorId] = useState<string | null>(
  colaborador.setor_id ?? null,
 );
 const [localidadeId, setLocalidadeId] = useState<string | null>(
  colaborador.localidade_id ?? null,
 );
 // Adicionar estados:
 const [alocacoesAtivas, setAlocacoesAtivas] = useState<{
  maquinas: any[];
  notebooks: any[];
  aparelhos: any[];
  ramais: any[];
 } | null>(null);
 const [loadingAlocacoes, setLoadingAlocacoes] = useState(false);
 const [inativando, setInativando] = useState(false);

 const { update, remove, saving, deleting } = useCrud("colaboradores", () => {
  onRefresh();
  onClose();
 });

 const {
  register,
  handleSubmit,
  formState: { errors },
 } = useForm<FormData>({
  resolver: zodResolver(schema),
  defaultValues: {
   nome: colaborador.nome,
   codigo: colaborador.codigo,
   status: colaborador.status,
  },
 });

 function onSubmit(data: FormData) {
  update(
   colaborador.id,
   { ...data, setor_id: setorId, localidade_id: localidadeId },
   {
    previousData: colaborador,
    label: `Colaborador "${colaborador.nome}" atualizado`,
   },
  );
 }

 // Navegar para o item na respectiva página preservando o contexto atual.
 function handleNavigate(
  tipo: "maquinas" | "notebooks" | "aparelhos" | "ramais",
  itemId: string,
  preview?: { title: string; subtitle?: string },
 ) {
  const href = `/${tipo}?inspect=${itemId}`;
  if (preview) writePendingInspectPreview(window.sessionStorage, href, preview);
  router.push(href);
 }

 async function handleClickInativar() {
  setLoadingAlocacoes(true);
  try {
   const res = await fetch(`/api/colaboradores/${colaborador.id}/alocacoes`);
   if (res.ok) {
    const data = await res.json();
    setAlocacoesAtivas(data);
   }
  } catch {
   /* silencioso */
  } finally {
   setLoadingAlocacoes(false);
  }
  setShowDeleteConfirm(true);
 }

 async function handleConfirmarInativar() {
  setInativando(true);
  try {
   if (!isAdmin) {
    const res = await fetch("/api/solicitacoes-inventario", {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify(withPedidoMaloteContext({
      tipo_recurso: "colaboradores",
      recurso_id: colaborador.id,
      acao: "UPDATE",
      dados_anteriores: colaborador,
      dados_propostos: { status: "Inativo" },
      comentario: "Solicitação de inativação de colaborador.",
     })),
    });
    if (!res.ok) {
     const err = await res.json().catch(() => ({}));
     throw new Error(err.error || "Erro ao criar solicitação de inativação");
    }
    toast.success("Solicitação de inativação enviada para aprovação.");
    onRefresh();
    onClose();
    return;
   }

   const res = await fetch(`/api/colaboradores/${colaborador.id}/inativar`, {
    method: "POST",
   });
   if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao inativar colaborador");
   }
   const data = await res.json();
   toast.success(
    `"${colaborador.nome}" inativado${data.totalDesalocados > 0 ? ` e ${data.totalDesalocados} alocação${data.totalDesalocados > 1 ? "ões" : ""} liberada${data.totalDesalocados > 1 ? "s" : ""}` : ""}.`,
   );
   onRefresh();
   onClose();
  } catch (error) {
   toast.error(error instanceof Error ? error.message : "Erro ao inativar colaborador.");
  } finally {
   setInativando(false);
   setShowDeleteConfirm(false);
  }
 }

 const inp =
  "w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500";
 const lbl =
  "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1";

 const tabs: { key: Tab; label: string }[] = [
  { key: "info", label: "Informações" },
  { key: "alocacoes", label: "Alocações" },
  { key: "historico", label: "Histórico" },
 ];

 return (
  <>
   <AnimatedSheetFrame onClose={onClose}>
     {/* Header */}
     <div className="flex items-start justify-between p-5 border-b border-slate-100 dark:border-slate-800">
      <div>
       <h2 className="text-base font-semibold text-slate-900 dark:text-white">
        {mode === "edit" ? "Editar Colaborador" : colaborador.nome}
       </h2>
       {mode === "view" && (
        <div className="flex items-center gap-2 mt-1">
         <StatusBadge status={colaborador.status} />
         {colaborador.codigo != null && (
          <span className="text-xs text-slate-400 font-mono">
           #{colaborador.codigo}
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

     {/* Tabs — apenas no modo view */}
     {mode === "view" && (
      <div className="flex border-b border-slate-100 dark:border-slate-800 px-5">
       {tabs.map((t) => (
        <button
         key={t.key}
         type="button"
         onClick={() => setTab(t.key)}
         className={`
                    px-3 py-2.5 text-xs font-medium border-b-2 transition whitespace-nowrap
                    ${
                     tab === t.key
                      ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                    }
                  `}
        >
         {t.label}
        </button>
       ))}
      </div>
     )}

     {/* Body — view: Informações */}
     {mode === "view" && tab === "info" && (
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
       <DetailSection title="Dados do Colaborador">
        <DetailField label="Nome" value={colaborador.nome} />
        <DetailField
         label="Código de Pessoa"
         value={colaborador.codigo != null ? String(colaborador.codigo) : null}
        />
        <DetailField label="Setor" value={colaborador.setor_nome ?? "—"} />
        <DetailField
         label="Localidade"
         value={colaborador.localidade_nome ?? "—"}
        />
        <DetailField
         label="Status"
         value={<StatusBadge status={colaborador.status} />}
        />
        <DetailField
         label="Cadastrado em"
         value={formatDate(colaborador.created_at)}
        />
       </DetailSection>

       <section>
        <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
         Alocações atuais
        </h3>
        <ColaboradorAlocacoes
         colaboradorId={colaborador.id}
         interactive={false}
         variant="summary"
        />
       </section>
      </div>
     )}

     {/* Body — view: Alocações */}
     {mode === "view" && tab === "alocacoes" && (
      <div className="flex-1 overflow-y-auto p-5">
       <ColaboradorAlocacoes
        colaboradorId={colaborador.id}
        onNavigate={handleNavigate}
       />
      </div>
     )}

     {/* Body — view: Histórico */}
     {mode === "view" && tab === "historico" && (
      <div className="flex-1 overflow-y-auto p-5">
       <HistoricoPanel registroId={colaborador.id} tabela="colaboradores" />
      </div>
     )}

     {/* Body — edit */}
     {mode === "edit" && (
      <div className="flex-1 overflow-y-auto p-5">
       <form
        id="colab-form"
        onSubmit={(e) => {
         e.preventDefault();
         handleSubmit(onSubmit)(e);
        }}
        noValidate
        className="space-y-4"
       >
        <div>
         <label className={lbl}>Nome *</label>
         <input {...register("nome")} className={inp} />
         {errors.nome && (
          <p className="text-xs text-red-500 mt-0.5">{errors.nome.message}</p>
         )}
        </div>
        <div className="grid grid-cols-2 gap-3">
         <div>
          <label className={lbl}>Código de Pessoa</label>
          <input
           type="number"
           {...register("codigo", {
            setValueAs: (value) => (value === "" ? null : Number(value)),
           })}
           className={inp}
           placeholder="Ex: 12345"
          />
         </div>
         <div>
          <label className={lbl}>Status</label>
          <select {...register("status")} className={inp}>
           <option value="Ativo">Ativo</option>
           <option value="Inativo">Inativo</option>
          </select>
         </div>
        </div>
        <div>
         <label className={lbl}>Setor</label>
         <SetorSelect value={setorId} onChange={(id) => setSetorId(id)} />
        </div>
        <div>
         <label className={lbl}>Localidade</label>
         <LocalidadeSelect
          value={localidadeId}
          onChange={(id) => {
           setLocalidadeId(id);
          }}
         />
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
          onClick={handleClickInativar}
          disabled={loadingAlocacoes}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition disabled:opacity-60"
         >
          {loadingAlocacoes ? (
           <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
           <Trash2 className="w-3.5 h-3.5" />
          )}
          Inativar
         </button>
        )}
        {(isAdmin || canRequestInventoryChanges) && (
         <button
          type="button"
          onClick={(e) => {
           e.preventDefault();
           setMode("edit");
           setTab("info");
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
        <button
         type="submit"
         form="colab-form"
         disabled={saving}
         className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60 transition"
        >
         {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
         Salvar alterações
        </button>
       </>
      )}
     </div>
   </AnimatedSheetFrame>

   {showDeleteConfirm && alocacoesAtivas !== null && (
    <AnimatedDialogFrame
     onClose={() => setShowDeleteConfirm(false)}
     zClassName="z-[60]"
     className="max-w-md rounded-xl border border-slate-100 p-6 dark:border-slate-800"
    >
      <div className="flex items-center gap-3 mb-4">
       <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-950 flex items-center justify-center shrink-0">
        <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
       </div>
       <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
         Inativar colaborador
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
         Esta ação não pode ser desfeita.
        </p>
       </div>
      </div>

      {/* Aviso de alocações */}
      {(() => {
       const total =
        (alocacoesAtivas.maquinas?.length ?? 0) +
        (alocacoesAtivas.notebooks?.length ?? 0) +
        (alocacoesAtivas.aparelhos?.length ?? 0) +
        (alocacoesAtivas.ramais?.length ?? 0);

       if (total === 0) {
        return (
         <p className="text-sm text-slate-600 dark:text-slate-400 mb-5">
          Deseja inativar <strong>"{colaborador.nome}"</strong>? O colaborador
          não possui alocações ativas.
         </p>
        );
       }

       const itens: string[] = [
        ...alocacoesAtivas.maquinas.map(
         (a: any) =>
          `Máquina ${a.item?.endereco_ip ?? a.item?.nome_host ?? "—"}`,
        ),
        ...alocacoesAtivas.notebooks.map(
         (a: any) => `Notebook ${a.item?.numero_patrimonio ?? "—"}`,
        ),
        ...alocacoesAtivas.aparelhos.map(
         (a: any) => `Aparelho ${a.item?.modelo ?? "—"}`,
        ),
        ...alocacoesAtivas.ramais.map(
         (a: any) => `Ramal ${a.item?.numero_ramal ?? "—"}`,
        ),
       ];

       return (
        <>
         <p className="text-sm text-slate-700 dark:text-slate-300 mb-3">
          Deseja inativar <strong>"{colaborador.nome}"</strong>?
         </p>
         <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3 mb-4">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">
           ⚠️ {total} alocação{total > 1 ? "ões" : ""} ativa
           {total > 1 ? "s" : ""} será{total > 1 ? "ão" : ""} liberada
           {total > 1 ? "s" : ""} automaticamente:
          </p>
          <ul className="space-y-1">
           {itens.map((label, i) => (
            <li
             key={i}
             className="text-xs text-amber-700 dark:text-amber-500 flex items-center gap-1.5"
            >
             <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
             {label}
            </li>
           ))}
          </ul>
         </div>
        </>
       );
      })()}

      <div className="flex gap-2 justify-end">
       <button
        type="button"
        onClick={() => setShowDeleteConfirm(false)}
        disabled={inativando}
        className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
       >
        Cancelar
       </button>
       <button
        type="button"
        onClick={handleConfirmarInativar}
        disabled={inativando}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition disabled:opacity-60"
       >
        {inativando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Confirmar inativação
       </button>
      </div>
    </AnimatedDialogFrame>
   )}
  </>
 );
}
