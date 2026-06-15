import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isPrivilegedProfile } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { registrarAuditoria } from '@/lib/audit'

export const runtime = 'nodejs'
type Props = { params: Promise<{ id: string; cid: string }> }

export async function PATCH(request: Request, { params }: Props) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { cid } = await params
    const userId  = (session.user as any).id as string
    const userName = session.user?.name ?? 'Usuário'
    const perfil  = (session.user as any).perfil as string
    
    // Pegando também o arquivo_ids do body
    const body = await request.json()
    const { conteudo, arquivo_ids = [] } = body

    const comentario = await prisma.forum_comentarios.findUnique({
      where: { id: cid },
      include: { vinculos: true, arquivos: true, reacoes: true, topico: { select: { titulo: true } } },
    })
    if (!comentario) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
    if (comentario.autor_id !== userId && !isPrivilegedProfile(perfil)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const updated = await prisma.forum_comentarios.update({
      where: { id: cid },
      data: { conteudo: conteudo.trim(), editado: true, updated_at: new Date() },
      include: { vinculos: true, reacoes: { select: { usuario_id: true, tipo: true } } },
    })

    // NOVA LÓGICA: Vincula as novas imagens anexadas durante a edição
    if (Array.isArray(arquivo_ids) && arquivo_ids.length > 0) {
      await prisma.forum_arquivos.updateMany({
        where: { id: { in: arquivo_ids } },
        data: { comentario_id: cid },
      })
    }

    const comentarioAtualizado = await prisma.forum_comentarios.findUnique({
      where: { id: cid },
      include: {
        vinculos: true,
        arquivos: true,
        reacoes: { select: { usuario_id: true, tipo: true } },
        topico: { select: { titulo: true } },
      },
    })

    await registrarAuditoria({
      tabela: 'forum_comentarios',
      registro_id: cid,
      acao: 'UPDATE',
      descricao: `Comentário editado no tópico "${comentario.topico.titulo}"`,
      dados_anteriores: comentario as any,
      dados_novos: comentarioAtualizado as any,
      usuario_id: userId,
      usuario_nome: userName,
    })

    return NextResponse.json(comentarioAtualizado ?? updated)
  } catch (err) {
    console.error('[PATCH /api/forum/comentarios/[cid]]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: Props) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { cid }  = await params
    const userId   = (session.user as any).id as string
    const userName = session.user?.name ?? 'Usuário'
    const perfil   = (session.user as any).perfil as string

    const comentario = await prisma.forum_comentarios.findUnique({
      where: { id: cid },
      include: { vinculos: true, arquivos: true, reacoes: true, topico: { select: { titulo: true } } },
    })
    if (!comentario) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
    if (comentario.autor_id !== userId && !isPrivilegedProfile(perfil)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    await prisma.forum_comentarios.delete({ where: { id: cid } })
    await registrarAuditoria({
      tabela: 'forum_comentarios',
      registro_id: cid,
      acao: 'DELETE',
      descricao: `Comentário excluído do tópico "${comentario.topico.titulo}"`,
      dados_anteriores: comentario as any,
      usuario_id: userId,
      usuario_nome: userName,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/forum/comentarios/[cid]]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
