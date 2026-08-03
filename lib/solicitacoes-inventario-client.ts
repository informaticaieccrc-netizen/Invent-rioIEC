export const PEDIDO_MALOTE_STORAGE_KEY = 'inventario:pedido-malote'

export type PedidoMaloteContext = {
  pedido_pai_id: string
  malote_id?: string | null
  label?: string | null
  expires_at: number
}

function storageAvailable(storage?: Storage | null): storage is Storage {
  return Boolean(storage)
}

export function readPedidoMaloteContext(storage?: Storage | null): PedidoMaloteContext | null {
  const targetStorage = storage ?? (typeof window !== 'undefined' ? window.sessionStorage : null)
  if (!storageAvailable(targetStorage)) return null

  try {
    const raw = targetStorage.getItem(PEDIDO_MALOTE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PedidoMaloteContext>
    if (!parsed.pedido_pai_id || !parsed.expires_at || parsed.expires_at < Date.now()) {
      targetStorage.removeItem(PEDIDO_MALOTE_STORAGE_KEY)
      return null
    }
    return parsed as PedidoMaloteContext
  } catch {
    targetStorage.removeItem(PEDIDO_MALOTE_STORAGE_KEY)
    return null
  }
}

export function writePedidoMaloteContext(
  context: Omit<PedidoMaloteContext, 'expires_at'> & { expires_at?: number },
  storage?: Storage | null,
) {
  const targetStorage = storage ?? (typeof window !== 'undefined' ? window.sessionStorage : null)
  if (!storageAvailable(targetStorage)) return
  targetStorage.setItem(PEDIDO_MALOTE_STORAGE_KEY, JSON.stringify({
    ...context,
    expires_at: context.expires_at ?? Date.now() + 30 * 60 * 1000,
  }))
}

export function clearPedidoMaloteContext(storage?: Storage | null) {
  const targetStorage = storage ?? (typeof window !== 'undefined' ? window.sessionStorage : null)
  if (!storageAvailable(targetStorage)) return
  targetStorage.removeItem(PEDIDO_MALOTE_STORAGE_KEY)
}

export function withPedidoMaloteContext<T extends Record<string, unknown>>(body: T, storage?: Storage | null): T {
  const context = readPedidoMaloteContext(storage)
  if (!context) return body
  return {
    ...body,
    pedido_pai_id: context.pedido_pai_id,
  }
}

function firstString(...values: unknown[]) {
  const found = values.find(value => typeof value === 'string' && value.trim())
  return found ? String(found).trim() : null
}

export function writePedidoMaloteFromPedido(
  pedido: {
    id?: string | null
    malote_id?: string | null
    dados_propostos?: Record<string, unknown> | null
    dados_anteriores?: Record<string, unknown> | null
  } | null,
  fallbackLabel?: string | null,
  storage?: Storage | null,
) {
  if (!pedido?.id) return
  const next = pedido.dados_propostos ?? {}
  const previous = pedido.dados_anteriores ?? {}
  writePedidoMaloteContext({
    pedido_pai_id: pedido.id,
    malote_id: pedido.malote_id ?? pedido.id,
    label: fallbackLabel ?? firstString(
      next.recurso_label,
      previous.recurso_label,
      next.maquina_label,
      previous.maquina_label,
      next.notebook_label,
      previous.notebook_label,
      next.aparelho_label,
      previous.aparelho_label,
      next.ramal_label,
      previous.ramal_label,
      next.colaborador_nome,
      previous.colaborador_nome,
    ),
  }, storage)
}

export function updatePedidoMaloteAfterSubmit(
  adicionarMaisPedidos: boolean,
  pedido: Parameters<typeof writePedidoMaloteFromPedido>[0],
  fallbackLabel?: string | null,
  storage?: Storage | null,
) {
  if (adicionarMaisPedidos) {
    writePedidoMaloteFromPedido(pedido, fallbackLabel, storage)
    return
  }

  if (readPedidoMaloteContext(storage)) {
    clearPedidoMaloteContext(storage)
  }
}
