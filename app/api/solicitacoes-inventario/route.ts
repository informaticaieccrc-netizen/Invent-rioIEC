import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { authOptions, isPrivilegedProfile } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAuditSession, registrarAuditoria } from '@/lib/audit'
import {
  assimilarTrocaAlocacaoPendente,
  buscarSnapshotSolicitacaoInventario,
  cleanInventarioPayload,
  enriquecerPayloadInventario,
  normalizarTipoRecurso,
  resolverMaloteNovaSolicitacao,
  SOLICITACAO_INVENTARIO_ACOES,
  sanitizeSolicitacaoInventarioResponse,
  sanitizeSolicitacoesInventarioResponse,
} from '@/lib/solicitacoes-inventario'

export const runtime = 'nodejs'

function solicitacoesInventarioDelegate() {
  return (prisma as any).solicitacoes_inventario as any
}

function buildComentario(texto: unknown, autor: { id: string | null; nome: string | null }, papel: 'solicitante' | 'revisor') {
  const conteudo = typeof texto === 'string' ? texto.trim() : ''
  if (!conteudo) return null
  return {
    id: randomUUID(),
    autor_id: autor.id,
    autor_nome: autor.nome ?? 'Usuário',
    papel,
    conteudo,
    created_at: new Date().toISOString(),
  }
}

async function enriquecerSolicitacaoListada(solicitacao: any) {
  const tipoRecurso = normalizarTipoRecurso(String(solicitacao.tipo_recurso ?? ''))
  if (!tipoRecurso || tipoRecurso === 'forum_arquivos') return solicitacao

  const [dadosAnteriores, dadosPropostos] = await Promise.all([
    buscarSnapshotSolicitacaoInventario(tipoRecurso, solicitacao.recurso_id ?? null, solicitacao.dados_anteriores),
    enriquecerPayloadInventario(tipoRecurso, solicitacao.dados_propostos ?? {}),
  ])

  return {
    ...solicitacao,
    dados_anteriores: dadosAnteriores,
    dados_propostos: dadosPropostos,
  }
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || ''
    const tipoRecurso = searchParams.get('tipo_recurso') || ''
    const acao = searchParams.get('acao') || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.max(1, Math.min(500, parseInt(searchParams.get('limit') || '100', 10)))
    const isAdmin = isPrivilegedProfile((session.user as any)?.perfil)

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (tipoRecurso) where.tipo_recurso = tipoRecurso
    if (acao) where.acao = acao
    if (!isAdmin) where.solicitante_id = (session.user as any)?.id ?? '__sem_usuario__'

    const delegate = solicitacoesInventarioDelegate()
    const [data, total] = await Promise.all([
      delegate.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ status: 'asc' }, { created_at: 'desc' }],
      }),
      delegate.count({ where }),
    ])

    const enriched = await Promise.all(data.map(enriquecerSolicitacaoListada))
    return NextResponse.json({ data: sanitizeSolicitacoesInventarioResponse(enriched), total, page, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    console.error('[GET /api/solicitacoes-inventario]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const body = await request.json()
    const tipoRecurso = normalizarTipoRecurso(String(body?.tipo_recurso ?? body?.entity ?? ''))
    const acao = String(body?.acao ?? '')
    const recursoId = body?.recurso_id ? String(body.recurso_id) : null
    const pedidoPaiId = body?.pedido_pai_id ? String(body.pedido_pai_id) : null

    if (!tipoRecurso) return NextResponse.json({ error: 'Tipo de recurso inválido' }, { status: 400 })
    if (!SOLICITACAO_INVENTARIO_ACOES.includes(acao as any)) {
      return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
    }
    if (acao !== 'CREATE' && acao !== 'ALLOCATE' && acao !== 'UPLOAD' && !recursoId) {
      return NextResponse.json({ error: 'recurso_id é obrigatório' }, { status: 400 })
    }

    const { usuario_id, usuario_nome } = await getAuditSession()
    const dadosAnteriores = await buscarSnapshotSolicitacaoInventario(tipoRecurso, recursoId, body?.dados_anteriores)
    const dadosPropostosBase = cleanInventarioPayload(body?.dados_propostos ?? body?.data ?? {})
    const dadosPropostos = await enriquecerPayloadInventario(tipoRecurso, dadosPropostosBase)
    const comentarioInicial = buildComentario(body?.comentario, { id: usuario_id, nome: usuario_nome }, 'solicitante')
    const isAdmin = isPrivilegedProfile((session.user as any)?.perfil)
    const malote = await resolverMaloteNovaSolicitacao({
      pedidoPaiId,
      usuarioId: usuario_id,
      isAdmin,
      novaSolicitacao: {
        id: '__novo_pedido__',
        tipo_recurso: tipoRecurso,
        recurso_id: recursoId,
        acao,
        dados_anteriores: dadosAnteriores as Record<string, unknown> | null,
        dados_propostos: dadosPropostos as Record<string, unknown>,
      },
    })

    const trocaAssimilada = pedidoPaiId ? null : await assimilarTrocaAlocacaoPendente({
      tipoRecurso,
      acao,
      recursoId,
      dadosAnteriores: dadosAnteriores as Record<string, unknown> | null,
      dadosPropostos: dadosPropostos as Record<string, unknown>,
      comentario: comentarioInicial,
      usuarioId: usuario_id,
    })
    if (trocaAssimilada) {
      await registrarAuditoria({
        tabela: 'solicitacoes_inventario',
        registro_id: trocaAssimilada.id,
        acao: 'UPDATE',
        descricao: `Solicitação de desalocação assimilada como troca em ${tipoRecurso}`,
        dados_anteriores: trocaAssimilada.dados_anteriores as any,
        dados_novos: trocaAssimilada as any,
        usuario_id,
        usuario_nome,
      })
      return NextResponse.json(sanitizeSolicitacaoInventarioResponse(trocaAssimilada), { status: 200 })
    }

    const solicitacao = await solicitacoesInventarioDelegate().create({
      data: {
        status: 'pendente',
        tipo_recurso: tipoRecurso,
        recurso_id: recursoId,
        acao,
        dados_anteriores: dadosAnteriores as Prisma.InputJsonValue,
        dados_propostos: dadosPropostos as Prisma.InputJsonValue,
        comentarios: (comentarioInicial ? [comentarioInicial] : []) as Prisma.InputJsonValue,
        pedido_pai_id: malote.pedido_pai_id,
        malote_id: malote.malote_id,
        malote_ordem: malote.malote_ordem,
        solicitante_id: usuario_id,
        solicitante_nome: usuario_nome,
      },
    })

    if (!malote.malote_id) {
      await solicitacoesInventarioDelegate().update({
        where: { id: solicitacao.id },
        data: { malote_id: solicitacao.id },
      })
      solicitacao.malote_id = solicitacao.id
    }

    await registrarAuditoria({
      tabela: 'solicitacoes_inventario',
      registro_id: solicitacao.id,
      acao: 'CREATE',
      descricao: `Solicitação de ${acao.toLowerCase()} em ${tipoRecurso}`,
      dados_anteriores: dadosAnteriores as any,
      dados_novos: solicitacao as any,
      usuario_id,
      usuario_nome,
    })

    return NextResponse.json(sanitizeSolicitacaoInventarioResponse(solicitacao), { status: 201 })
  } catch (error) {
    console.error('[POST /api/solicitacoes-inventario]', error)
    if (error instanceof Error) {
      if (error.message.startsWith('Conflito no malote')) {
        return NextResponse.json({ error: error.message }, { status: 409 })
      }
      if (
        error.message.startsWith('Pedido base do malote') ||
        error.message.startsWith('Só é possível empilhar')
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
