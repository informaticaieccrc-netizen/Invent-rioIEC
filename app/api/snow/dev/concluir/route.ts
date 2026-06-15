import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Session } from 'next-auth'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { markSnowItemCompleted } from '@/lib/snow/repositories'
import { SnowProcessingError } from '@/lib/snow/types'

export const runtime = 'nodejs'

function isDevSession(session: Session | null) {
  return (session?.user as any)?.perfil === 'dev'
}

function text(value: unknown) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!isDevSession(session)) {
    return NextResponse.json({ error: 'Disponível somente para perfil dev' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const itemId = text(body.item_id)
    const solicitacaoId = text(body.solicitacao_id)
    const usuarioId = text(body.usuario_id)
    const observacao = text(body.observacao) ?? 'Concluído manualmente pelo painel dev'

    if (!itemId && !solicitacaoId) {
      return NextResponse.json({ error: 'Informe item_id ou solicitacao_id' }, { status: 400 })
    }

    const usuario = usuarioId
      ? await prisma.usuarios.findFirst({
          where: { id: usuarioId, ativo: true },
          select: { nome: true, codigo_pessoa: true, email: true },
        })
      : null

    if (usuarioId && !usuario) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    const ids = itemId
      ? [itemId]
      : (await prisma.solicitacoes_snow_itens.findMany({
          where: {
            solicitacao_snow_id: solicitacaoId as string,
            status: { in: ['atendida', 'inconsistente'] },
            planner_status: { not: 'concluido' },
          },
          select: { id: true },
          orderBy: { criado_em: 'asc' },
        })).map(item => item.id)

    if (ids.length === 0) {
      return NextResponse.json({
        updated: 0,
        message: 'Nenhuma chamada operacional aberta encontrada.',
      })
    }

    const completed = []
    for (const id of ids) {
      completed.push(await markSnowItemCompleted({
        id,
        atendenteNome: usuario?.nome ?? null,
        atendenteCodigoPessoa: usuario?.codigo_pessoa ?? usuario?.email ?? null,
        observacao,
      }))
    }

    return NextResponse.json({
      updated: completed.length,
      usuario: usuario ? { nome: usuario.nome, codigo_pessoa: usuario.codigo_pessoa, email: usuario.email } : null,
      itens: completed.map(item => ({
        id: item.id,
        planner_status: item.planner_status,
        atendente_nome: item.atendente_nome,
        atendente_codigo_pessoa: item.atendente_codigo_pessoa,
        concluido_em: item.concluido_em,
      })),
    })
  } catch (error) {
    if (error instanceof SnowProcessingError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Item SNOW não encontrado' }, { status: 404 })
    }

    console.error('[POST /api/snow/dev/concluir]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
