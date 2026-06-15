import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const [result] = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM solicitacoes_snow s
      WHERE EXISTS (
        SELECT 1
        FROM solicitacoes_snow_itens i
        WHERE i.solicitacao_snow_id = s.id
          AND i.status IN ('atendida', 'inconsistente')
          AND i.planner_status IS DISTINCT FROM 'concluido'
      )
    `

    return NextResponse.json({ count: Number(result?.count ?? 0) })
  } catch (error) {
    console.error('[GET /api/snow/count]', error)
    return NextResponse.json({ count: 0 }, { status: 500 })
  }
}
