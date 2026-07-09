export interface AuditLog {
  id: string
  tabela: string
  registro_id: string
  acao: string
  descricao: string | null
  dados_anteriores: unknown
  dados_novos: unknown
  usuario_id: string | null
  usuario_nome: string | null
  usuario_nome_original?: string | null
  created_at: string | null
}

export const ACAO_COLORS: Record<string, string> = {
  CREATE:          'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  UPDATE:          'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  DELETE:          'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  ALOCAR:          'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  DESALOCAR:       'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  EDITAR_ALOCACAO: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  APROVAR:         'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  REJEITAR:        'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  RECUSAR:         'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
}

export const ACAO_LABELS: Record<string, string> = {
  CREATE:          'Criação',
  UPDATE:          'Edição',
  DELETE:          'Exclusão',
  ALOCAR:          'Alocação',
  DESALOCAR:       'Desalocação',
  EDITAR_ALOCACAO: 'Edição de Alocação',
  APROVAR:         'Aprovação',
  REJEITAR:        'Rejeição',
  RECUSAR:         'Recusa',
}

export const TABELAS_OPCOES = [
  { value: 'maquinas',            label: 'Máquinas' },
  { value: 'notebooks',           label: 'Notebooks' },
  { value: 'aparelhos',           label: 'Aparelhos' },
  { value: 'impressoras',         label: 'Impressoras' },
  { value: 'monitores',           label: 'Monitores' },
  { value: 'ramais',              label: 'Ramais' },
  { value: 'racks',               label: 'Racks' },
  { value: 'colaboradores',       label: 'Colaboradores' },
  { value: 'movimentacoes',       label: 'Movimentações' },
  { value: 'usuarios',            label: 'Usuários' },
  { value: 'solicitacoes_usuarios', label: 'Solicitações de Usuário' },
  { value: 'solicitacoes_inventario', label: 'Solicitações de Inventário' },
  { value: 'forum',               label: 'Fórum — Todos' },
  { value: 'forum_topicos',       label: 'Fórum — Tópicos' },
  { value: 'forum_comentarios',   label: 'Fórum — Comentários' },
  { value: 'forum_reacoes',       label: 'Fórum — Reações' },
  { value: 'forum_arquivos',      label: 'Fórum — Arquivos' },
  { value: 'forum_pastas',        label: 'Fórum — Pastas' },
  { value: 'alocacoes_maquinas',  label: 'Alocações — Máquinas' },
  { value: 'alocacoes_notebooks', label: 'Alocações — Notebooks' },
  { value: 'alocacoes_aparelhos', label: 'Alocações — Aparelhos' },
  { value: 'alocacoes_ramais',    label: 'Alocações — Ramais' },
  { value: 'alocacoes_monitores', label: 'Alocações — Monitores' },
]
