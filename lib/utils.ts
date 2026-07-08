import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return '—'
  }
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  } catch {
    return '—'
  }
}

// ─── Mapeamentos de campos Int do banco ──────────────────────────────────────

export const TIPO_DISPOSITIVO_MAP: Record<number, string> = {
  1: 'Máquina',
  2: 'Notebook',
  3: 'Aparelho',
  4: 'Impressora',
  5: 'Ramal',
  6: 'Rack',
}

export const TIPO_MOVIMENTACAO_MAP: Record<number, string> = {
  1: 'Entrada',
  2: 'Saída',
  3: 'Transferência',
  4: 'Manutenção',
  5: 'Empréstimo',
  6: 'Devolução',
}

export const TIPO_SOLICITACAO_MAP: Record<number, string> = {
  1: 'Suporte',
  2: 'Instalação',
  3: 'Troca',
  4: 'Configuração',
  5: 'Manutenção',
  6: 'Novo ativo',
}

export const STATUS_SOLICITACAO_MAP: Record<number, string> = {
  1: 'Aberto',
  2: 'Em andamento',
  3: 'Pendente',
  4: 'Concluído',
  5: 'Cancelado',
}

export const PRIORIDADE_MAP: Record<number, string> = {
  1: 'Baixa',
  2: 'Média',
  3: 'Alta',
  4: 'Crítica',
  5: 'Urgente',
}

export const ORIGEM_SOLICITACAO_MAP: Record<number, string> = {
  1: 'E-mail',
  2: 'Telefone',
  3: 'Presencial',
  4: 'Sistema',
  5: 'WhatsApp',
}

export const TIPO_APARELHO_MAP: Record<number, string> = {
  567000000: 'Fixo',
  567000001: 'Móvel',
}

// Solicitações abertas = status != 4 (Concluído) e != 5 (Cancelado)
export const STATUS_ABERTOS = [1, 2, 3]
export const STATUS_FECHADOS = [4, 5]

export function mapTipoDispositivo(tipo: number | string | null | undefined): string {
  if (tipo === null || tipo === undefined) return '—'
  const n = typeof tipo === 'string' ? parseInt(tipo) : tipo
  return TIPO_DISPOSITIVO_MAP[n] || `Tipo ${tipo}`
}

export function mapTipoMovimentacao(tipo: number | string | null | undefined): string {
  if (tipo === null || tipo === undefined) return '—'
  const n = typeof tipo === 'string' ? parseInt(tipo) : tipo
  return TIPO_MOVIMENTACAO_MAP[n] || `Tipo ${tipo}`
}

export function mapTipoSolicitacao(tipo: number | string | null | undefined): string {
  if (tipo === null || tipo === undefined) return '—'
  const n = typeof tipo === 'string' ? parseInt(tipo) : tipo
  return TIPO_SOLICITACAO_MAP[n] || `Tipo ${tipo}`
}

export function mapStatusSolicitacao(status: number | string | null | undefined): string {
  if (status === null || status === undefined) return '—'
  const n = typeof status === 'string' ? parseInt(status) : status
  return STATUS_SOLICITACAO_MAP[n] || `Status ${status}`
}

export function mapPrioridade(p: number | string | null | undefined): string {
  if (p === null || p === undefined) return '—'
  const n = typeof p === 'string' ? parseInt(p) : p
  return PRIORIDADE_MAP[n] || `Prioridade ${p}`
}

export function mapOrigem(o: number | string | null | undefined): string {
  if (o === null || o === undefined) return '—'
  const n = typeof o === 'string' ? parseInt(o) : o
  return ORIGEM_SOLICITACAO_MAP[n] || `Origem ${o}`
}

export function mapTipoAparelho(tipo: number | string | null | undefined): string {
  if (tipo === null || tipo === undefined) return '—'
  const n = typeof tipo === 'string' ? parseInt(tipo) : tipo
  return TIPO_APARELHO_MAP[n] || `Tipo ${tipo}`
}
