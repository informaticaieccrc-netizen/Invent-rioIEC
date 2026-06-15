import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isPrivilegedProfile } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deleteArquivo } from '@/lib/supabase-storage'
import { registrarAuditoria } from '@/lib/audit'

export const runtime = 'nodejs'
type Props = { params: Promise<{ id: string }> }

export async function DELETE(_: Request, { params }: Props) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { id }   = await params
    const userId   = (session.user as any).id as string
    const userName = session.user?.name ?? 'Usuário'
    const perfil   = (session.user as any).perfil as string

    const arquivo = await prisma.forum_arquivos.findUnique({ where: { id } })
    if (!arquivo) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
    if (arquivo.usuario_id !== userId && !isPrivilegedProfile(perfil)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    await deleteArquivo(arquivo.nome_armazenado)
    await prisma.forum_arquivos.delete({ where: { id } })
    await registrarAuditoria({
      tabela: 'forum_arquivos',
      registro_id: id,
      acao: 'DELETE',
      descricao: `Arquivo "${arquivo.nome_original}" removido do fórum`,
      dados_anteriores: arquivo as any,
      usuario_id: userId,
      usuario_nome: userName,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
