import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { randomUUID } from 'crypto'
import { authOptions, isPrivilegedProfile } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAuditSession, registrarAuditoria } from '@/lib/audit'
import {
  aplicarSolicitacaoInventario,
  buscarSolicitacoesPendentesDoMalote,
  descartarUploadPendenteSolicitacao,
  ordenarSolicitacoesParaAplicacao,
  sanitizeSolicitacaoInventarioResponse,
  validarConflitosMaloteSolicitacoes,
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
      const malotePendentes = await buscarSolicitacoesPendentesDoMalote(solicitacao)
      let recusadaSelecionada = null

      for (const pedido of malotePendentes) {
        await descartarUploadPendenteSolicitacao(pedido)
        const pedidoComentarios = pedido.id === id ? comentarios : existingComentarios(pedido.comentarios)
        const recusada = await delegate.update({
          where: { id: pedido.id },
          data: {
            status: 'recusada',
            parecer,
            comentarios: pedidoComentarios as Prisma.InputJsonValue,
            erro_aplicacao: null,
            revisor_id: reviewer.usuario_id,
            revisor_nome: reviewer.usuario_nome,
            revisado_em: new Date(),
            updated_at: new Date(),
          },
        })

        if (pedido.id === id) recusadaSelecionada = recusada

        await registrarAuditoria({
          tabela: 'solicitacoes_inventario',
          registro_id: pedido.id,
          acao: 'RECUSAR',
          descricao: malotePendentes.length > 1
            ? `Malote de inventário recusado${parecer ? `: ${parecer}` : ''}`
            : `Solicitação de inventário recusada${parecer ? `: ${parecer}` : ''}`,
          dados_anteriores: pedido as any,
          dados_novos: recusada as any,
          usuario_id: reviewer.usuario_id,
          usuario_nome: reviewer.usuario_nome,
        })
      }

      return NextResponse.json(sanitizeSolicitacaoInventarioResponse(recusadaSelecionada ?? malotePendentes[0]))
    }

    if (decisao !== 'aprovar' && decisao !== 'aprovada') {
      return NextResponse.json({ error: 'Decisão inválida' }, { status: 400 })
    }

    try {
      const malotePendentes = await buscarSolicitacoesPendentesDoMalote(solicitacao)
      validarConflitosMaloteSolicitacoes(malotePendentes)
      const ordenadas = ordenarSolicitacoesParaAplicacao(malotePendentes)
      let aprovadaSelecionada = null

      for (const pedido of ordenadas) {
        const aplicado = await aplicarSolicitacaoInventario(pedido, reviewer)
        const pedidoComentarios = pedido.id === id ? comentarios : existingComentarios(pedido.comentarios)
        const aprovada = await delegate.update({
          where: { id: pedido.id },
          data: {
            status: 'aprovada',
            parecer,
            comentarios: pedidoComentarios as Prisma.InputJsonValue,
            erro_aplicacao: null,
            revisor_id: reviewer.usuario_id,
            revisor_nome: reviewer.usuario_nome,
            revisado_em: new Date(),
            updated_at: new Date(),
          },
        })

        if (pedido.id === id) aprovadaSelecionada = aprovada

        await registrarAuditoria({
          tabela: 'solicitacoes_inventario',
          registro_id: pedido.id,
          acao: 'APROVAR',
          descricao: malotePendentes.length > 1 ? 'Pedido aprovado dentro de malote de inventário' : 'Solicitação de inventário aprovada',
          dados_anteriores: pedido as any,
          dados_novos: { solicitacao: aprovada, aplicado } as Prisma.InputJsonObject,
          usuario_id: reviewer.usuario_id,
          usuario_nome: reviewer.usuario_nome,
        })
      }

      return NextResponse.json(sanitizeSolicitacaoInventarioResponse(aprovadaSelecionada ?? ordenadas[0]))
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
