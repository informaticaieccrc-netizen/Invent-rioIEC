import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { markSnowItemAssumed } from '@/lib/snow/repositories'
import { SnowProcessingError } from '@/lib/snow/types'

export const runtime = 'nodejs'

function isDevSession(session: Awaited<ReturnType<typeof getServerSession>>) {
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
    const usuarioId = text(body.usuario_id)

    if (!itemId || !usuarioId) {
      return NextResponse.json({ error: 'Informe item_id e usuario_id' }, { status: 400 })
    }

    const usuario = await prisma.usuarios.findFirst({
      where: { id: usuarioId, ativo: true },
      select: { nome: true, codigo_pessoa: true, email: true },
    })

    if (!usuario) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    const item = await markSnowItemAssumed({
      id: itemId,
      atendenteNome: usuario.nome,
      atendenteCodigoPessoa: usuario.codigo_pessoa ?? usuario.email,
    })

    return NextResponse.json({
      id: item.id,
      planner_status: item.planner_status,
      planner_task_id: item.planner_task_id,
      atendente_nome: item.atendente_nome,
      atendente_codigo_pessoa: item.atendente_codigo_pessoa,
      assumido_em: item.assumido_em,
      planner_atualizado_em: item.planner_atualizado_em,
    })
  } catch (error) {
    if (error instanceof SnowProcessingError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Item SNOW não encontrado' }, { status: 404 })
    }

    console.error('[POST /api/snow/dev/atribuir]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
