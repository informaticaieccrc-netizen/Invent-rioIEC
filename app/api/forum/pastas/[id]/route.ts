import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isPrivilegedProfile } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deleteArquivo } from '@/lib/supabase-storage'
import { registrarAuditoria } from '@/lib/audit'

export const runtime = 'nodejs'
type Props = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Props) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { id } = await params
    const userId = (session.user as any).id as string
    const userName = session.user?.name ?? 'Usuário'
    const { nome, descricao, cor } = await request.json()
    const anterior = await prisma.forum_pastas.findUnique({ where: { id } })

    const pasta = await prisma.forum_pastas.update({
      where: { id },
      data: {
        nome:       nome?.trim(),
        descricao:  descricao || null,
        cor:        cor,
        updated_at: new Date(),
      },
    })

    await registrarAuditoria({
      tabela: 'forum_pastas',
      registro_id: id,
      acao: 'UPDATE',
      descricao: `Pasta "${pasta.nome}" atualizada em documentos do fórum`,
      dados_anteriores: anterior as any,
      dados_novos: pasta as any,
      usuario_id: userId,
      usuario_nome: userName,
    })

    return NextResponse.json(pasta)
  } catch (err) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: Props) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const perfil = (session.user as any).perfil as string
    if (!isPrivilegedProfile(perfil)) return NextResponse.json({ error: 'Apenas admin/dev' }, { status: 403 })

    const { id } = await params
    const userId = (session.user as any).id as string
    const userName = session.user?.name ?? 'Usuário'

    // Deletar todos os arquivos do storage recursivamente
    const pasta = await prisma.forum_pastas.findUnique({
      where: { id },
      include: { arquivos: true, filhos: true },
    })
    const arquivos = await prisma.forum_arquivos.findMany({
      where: { pasta_id: id },
      select: { nome_armazenado: true },
    })
    await Promise.all(arquivos.map(a => deleteArquivo(a.nome_armazenado)))

    await prisma.forum_pastas.delete({ where: { id } })
    await registrarAuditoria({
      tabela: 'forum_pastas',
      registro_id: id,
      acao: 'DELETE',
      descricao: `Pasta "${pasta?.nome ?? id}" removida de documentos do fórum`,
      dados_anteriores: pasta as any,
      usuario_id: userId,
      usuario_nome: userName,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
