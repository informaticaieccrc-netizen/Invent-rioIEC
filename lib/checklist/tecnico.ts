import { ChecklistError } from '@/lib/checklists-validacao'
import { prisma } from '@/lib/prisma'

export type ChecklistTecnicoApto = {
  id: string
  nome: string
  codigo_pessoa: string
}

export async function getChecklistTecnicoApto(usuarioId?: string | null): Promise<ChecklistTecnicoApto | null> {
  if (!usuarioId) return null

  const usuario = await prisma.usuarios.findUnique({
    where: { id: usuarioId },
    select: { id: true, nome: true, codigo_pessoa: true, ativo: true },
  })
  const codigoPessoa = usuario?.codigo_pessoa?.trim()

  if (!usuario?.ativo || !codigoPessoa) return null

  return {
    id: usuario.id,
    nome: usuario.nome,
    codigo_pessoa: codigoPessoa,
  }
}

export async function ensureChecklistTecnicoApto(usuarioId?: string | null) {
  const tecnico = await getChecklistTecnicoApto(usuarioId)
  if (!tecnico) {
    throw new ChecklistError('Para assumir solicitações, o usuário precisa estar vinculado a um código de pessoa válido.', 403)
  }
  return tecnico
}
