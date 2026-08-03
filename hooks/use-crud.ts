import { useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  useSolicitacaoInventarioConfirm,
  useSolicitacaoInventarioPerfil,
} from '@/components/solicitacoes-inventario/solicitacao-confirm-provider'
import { updatePedidoMaloteAfterSubmit, withPedidoMaloteContext } from '@/lib/solicitacoes-inventario-client'

const UNDO_TIMEOUT_MS = 6000
const REQUESTABLE_ENTITIES = new Set([
  'maquinas',
  'notebooks',
  'aparelhos',
  'impressoras',
  'ramais',
  'racks',
  'colaboradores',
  'alocacoes_maquinas',
  'alocacoes_notebooks',
  'alocacoes_aparelhos',
  'alocacoes_ramais',
])

export function useCrud(entity: string, onSuccess?: () => void) {
  const [saving, setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const undoRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const confirmSolicitacao = useSolicitacaoInventarioConfirm()
  const perfil = useSolicitacaoInventarioPerfil()

  async function update(
    id: string,
    data: Record<string, any>,
    opts?: { previousData?: Record<string, any>; label?: string }
  ) {
    setSaving(true)
    try {
      const previous = opts?.previousData ?? null

      if (perfil === 'viewer' && REQUESTABLE_ENTITIES.has(entity)) {
        const solicitacao = await confirmSolicitacao()
        if (!solicitacao.confirmed) return

        const res = await fetch('/api/solicitacoes-inventario', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withPedidoMaloteContext({
            tipo_recurso: entity,
            recurso_id: id,
            acao: entity.startsWith('alocacoes_') ? 'CORRECTION' : 'UPDATE',
            dados_anteriores: previous,
            dados_propostos: data,
            comentario: solicitacao.comentario,
          })),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Erro ao criar solicitação')
        }
        const pedido = await res.json().catch(() => null)
        updatePedidoMaloteAfterSubmit(solicitacao.adicionarMaisPedidos, pedido)
        toast.success(solicitacao.adicionarMaisPedidos ? 'Solicitação enviada. Malote ativo para o próximo pedido.' : 'Solicitação enviada para aprovação.')
        onSuccess?.()
        return
      }

      const res = await fetch(`/api/${entity}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()

      onSuccess?.()

      // Cancelar toast anterior se houver
      if (undoRef.current) clearTimeout(undoRef.current)

      const label = opts?.label ?? 'Registro atualizado com sucesso!'

      // Mostrar toast com botão desfazer
      if (previous) {
        const toastId = toast(label, {
          description: 'Clique em desfazer para reverter.',
          duration: UNDO_TIMEOUT_MS,
          action: {
            label: 'Desfazer',
            onClick: async () => {
              toast.dismiss(toastId)
              if (undoRef.current) clearTimeout(undoRef.current)
              await revert(id, previous!, label)
            },
          },
          cancel: {
            label: 'Ok',
            onClick: () => toast.dismiss(toastId),
          },
        })
      } else {
        toast.success(label)
      }
    } catch {
      toast.error('Erro ao atualizar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  async function revert(id: string, previous: Record<string, any>, label: string) {
    try {
      const ignoredFields = new Set([
        'alocacoes',
        'alocacoes_ativas',
        'alocacao_ativa',
        'setor_rel',
        'setor_nome',
        'created_at',
        'id',
        'emprestado_colaborador',
        'emprestado_setor',
        'portas_livres',
        'ultima_revisao',
      ])
      const cleanData = Object.fromEntries(
        Object.entries(previous).filter(([key]) => !ignoredFields.has(key)),
      )

      const res = await fetch(`/api/${entity}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanData),
      })
      if (!res.ok) throw new Error()
      toast.success(`${label}!`)
      onSuccess?.()
    } catch {
      toast.error('Erro ao reverter alteração.')
    }
  }

  async function remove(id: string) {
    setDeleting(true)
    try {
      if (perfil === 'viewer' && REQUESTABLE_ENTITIES.has(entity)) {
        let previous = null
        try {
          const r = await fetch(`/api/${entity}/${id}`)
          if (r.ok) previous = await r.json()
        } catch { /* silencioso */ }

        const solicitacao = await confirmSolicitacao()
        if (!solicitacao.confirmed) return

        const res = await fetch('/api/solicitacoes-inventario', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withPedidoMaloteContext({
            tipo_recurso: entity,
            recurso_id: id,
            acao: 'DELETE',
            dados_anteriores: previous,
            dados_propostos: {},
            comentario: solicitacao.comentario,
          })),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Erro ao criar solicitação')
        }
        const pedido = await res.json().catch(() => null)
        updatePedidoMaloteAfterSubmit(solicitacao.adicionarMaisPedidos, pedido)
        toast.success(solicitacao.adicionarMaisPedidos ? 'Solicitação enviada. Malote ativo para o próximo pedido.' : 'Solicitação enviada para aprovação.')
        onSuccess?.()
        return
      }

      const res = await fetch(`/api/${entity}/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Registro excluído com sucesso!')
      onSuccess?.()
    } catch {
      toast.error('Erro ao excluir. Tente novamente.')
    } finally {
      setDeleting(false)
    }
  }

  return { update, remove, saving, deleting }
}
