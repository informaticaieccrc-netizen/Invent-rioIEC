import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import type { Prisma } from '@prisma/client'

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'ALOCAR'
  | 'DESALOCAR'
  | 'EDITAR_ALOCACAO'
  | 'APROVAR'
  | 'REJEITAR'
  | 'RECUSAR'

export const TABELA_LABELS: Record<string, string> = {
  maquinas: 'Máquinas',
  notebooks: 'Notebooks',
  aparelhos: 'Aparelhos',
  impressoras: 'Impressoras',
  ramais: 'Ramais',
  racks: 'Racks',
  colaboradores: 'Colaboradores',
  solicitacoes: 'Solicitações',
  alocacoes_maquinas: 'Alocações de Máquinas',
  alocacoes_notebooks: 'Alocações de Notebooks',
  alocacoes_aparelhos: 'Alocações de Aparelhos',
  alocacoes_ramais: 'Alocações de Ramais',
  alocacoes_monitores: 'Alocações de Monitores',
  usuarios: 'Usuários',
  solicitacoes_usuarios: 'Solicitações de Usuário',
  solicitacoes_inventario: 'Solicitações de Inventário',
  forum_topicos: 'Fórum — Tópicos',
  forum_comentarios: 'Fórum — Comentários',
  forum_reacoes: 'Fórum — Reações',
  forum_arquivos: 'Fórum — Arquivos',
  forum_pastas: 'Fórum — Pastas',
}

interface AuditParams {
  tabela: string
  registro_id: string
  acao: AuditAction
  descricao?: string
  dados_anteriores?: Record<string, unknown> | null
  dados_novos?: Record<string, unknown> | null
  usuario_id?: string | null
  usuario_nome?: string | null
}

export async function registrarAuditoria(params: AuditParams) {
  try {
    await prisma.audit_log.create({
      data: {
        tabela: params.tabela,
        registro_id: params.registro_id,
        acao: params.acao,
        descricao: params.descricao ?? null,
        dados_anteriores: params.dados_anteriores as Prisma.InputJsonValue | undefined,
        dados_novos: params.dados_novos as Prisma.InputJsonValue | undefined,
        usuario_id: params.usuario_id ?? null,
        usuario_nome: params.usuario_nome ?? null,
      },
    })
  } catch (err) {
    // Nunca deixar o log quebrar a operação principal
    console.error('[audit]', err)
  }
}

export async function getAuditSession() {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string | null; name?: string | null } | undefined

  return {
    usuario_id: user?.id ?? null,
    usuario_nome: user?.name ?? 'Desconhecido',
  }
}

// Gerar descrição legível da diferença entre dois objetos
export function descricaoDiff(
  anterior: Record<string, unknown>,
  novo: Record<string, unknown>
): string {
  const mudancas: string[] = []
  const camposIgnorados = ['created_at', 'updated_at', 'id']

  for (const key of Object.keys(novo)) {
    if (camposIgnorados.includes(key)) continue
    if (JSON.stringify(anterior[key]) !== JSON.stringify(novo[key])) {
      mudancas.push(`${key}: "${anterior[key] ?? '—'}" → "${novo[key] ?? '—'}"`)
    }
  }

  return mudancas.length > 0 ? mudancas.join(', ') : 'Sem alterações detectadas'
}
