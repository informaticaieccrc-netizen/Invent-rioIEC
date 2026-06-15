import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { randomUUID } from 'crypto'
import { authOptions, isPrivilegedProfile } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAuditSession, registrarAuditoria } from '@/lib/audit'
import {
  aplicarSolicitacaoInventario,
  descartarUploadPendenteSolicitacao,
  sanitizeSolicitacaoInventarioResponse,
} from '@/lib/solicitacoes-inventario'

export const runtime = 'nodejs'
type Props = { params: Promise<{ id: string }> }

function solicitacoesInventarioDelegate() {
  return (prisma as any).solicitacoes_inventario as any
}

function existingComentarios(value: unknown) {
  return Array.isArray(value) ? value : []
}

function buildComentario(texto: unknown, autor: { usuario_id: string | null; usuario_nome: string | null }, papel: 'solicitante' | 'revisor') {
  const conteudo = typeof texto === 'string' ? texto.trim() : ''
  if (!conteudo) return null
  return {
    id: randomUUID(),
    autor_id: autor.usuario_id,
    autor_nome: autor.usuario_nome ?? 'Usuário',
    papel,
    conteudo,
    created_at: new Date().toISOString(),
  }
}

export async function PATCH(request: Request, { params }: Props) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    const decisao = String(body?.decisao ?? body?.acao ?? '').toLowerCase()
    const parecer = typeof body?.parecer === 'string' ? body.parecer.trim() : null
    const comentario = typeof body?.comentario === 'string' ? body.comentario.trim() : ''
    const delegate = solicitacoesInventarioDelegate()
    const reviewer = await getAuditSession()

    const solicitacao = await delegate.findUnique({ where: { id } })
    if (!solicitacao) return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 })

    if (decisao === 'comentar' || decisao === 'comentario') {
      const sessionUserId = (session.user as any)?.id ?? null
      const isReviewer = isPrivilegedProfile((session.user as any)?.perfil)
      const canComment = isReviewer || solicitacao.solicitante_id === sessionUserId
      if (!canComment) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
      const novoComentario = buildComentario(comentario, reviewer, isReviewer ? 'revisor' : 'solicitante')
      if (!novoComentario) return NextResponse.json({ error: 'Comentário vazio' }, { status: 400 })

      const atualizada = await delegate.update({
        where: { id },
        data: {
          comentarios: [...existingComentarios(solicitacao.comentarios), novoComentario] as Prisma.InputJsonValue,
          updated_at: new Date(),
        },
      })
      return NextResponse.json(sanitizeSolicitacaoInventarioResponse(atualizada))
    }

    if (!isPrivilegedProfile((session.user as any)?.perfil)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }
    if (solicitacao.status !== 'pendente') {
      return NextResponse.json({ error: 'Solicitação já revisada' }, { status: 409 })
    }

    const comentarioRevisor = buildComentario(comentario || parecer, reviewer, 'revisor')
    const comentarios = comentarioRevisor
      ? [...existingComentarios(solicitacao.comentarios), comentarioRevisor]
      : existingComentarios(solicitacao.comentarios)

    if (decisao === 'recusar' || decisao === 'recusada' || decisao === 'rejeitar') {
      await descartarUploadPendenteSolicitacao(solicitacao)

      const recusada = await delegate.update({
        where: { id },
        data: {
          status: 'recusada',
          parecer,
          comentarios: comentarios as Prisma.InputJsonValue,
          erro_aplicacao: null,
          revisor_id: reviewer.usuario_id,
          revisor_nome: reviewer.usuario_nome,
          revisado_em: new Date(),
          updated_at: new Date(),
        },
      })

      await registrarAuditoria({
        tabela: 'solicitacoes_inventario',
        registro_id: id,
        acao: 'RECUSAR',
        descricao: `Solicitação de inventário recusada${parecer ? `: ${parecer}` : ''}`,
        dados_anteriores: solicitacao as any,
        dados_novos: recusada as any,
        usuario_id: reviewer.usuario_id,
        usuario_nome: reviewer.usuario_nome,
      })

      return NextResponse.json(sanitizeSolicitacaoInventarioResponse(recusada))
    }

    if (decisao !== 'aprovar' && decisao !== 'aprovada') {
      return NextResponse.json({ error: 'Decisão inválida' }, { status: 400 })
    }

    try {
      const aplicado = await aplicarSolicitacaoInventario(solicitacao, reviewer)
      const aprovada = await delegate.update({
        where: { id },
        data: {
          status: 'aprovada',
          parecer,
          comentarios: comentarios as Prisma.InputJsonValue,
          erro_aplicacao: null,
          revisor_id: reviewer.usuario_id,
          revisor_nome: reviewer.usuario_nome,
          revisado_em: new Date(),
          updated_at: new Date(),
        },
      })

      await registrarAuditoria({
        tabela: 'solicitacoes_inventario',
        registro_id: id,
        acao: 'APROVAR',
        descricao: 'Solicitação de inventário aprovada',
        dados_anteriores: solicitacao as any,
        dados_novos: { solicitacao: aprovada, aplicado } as Prisma.InputJsonObject,
        usuario_id: reviewer.usuario_id,
        usuario_nome: reviewer.usuario_nome,
      })

      return NextResponse.json(sanitizeSolicitacaoInventarioResponse(aprovada))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao aplicar solicitação'
      const atualizada = await delegate.update({
        where: { id },
        data: {
          erro_aplicacao: message,
          updated_at: new Date(),
        },
      })
      return NextResponse.json({ error: message, solicitacao: sanitizeSolicitacaoInventarioResponse(atualizada) }, { status: 409 })
    }
  } catch (error) {
    console.error('[PATCH /api/solicitacoes-inventario/[id]]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
