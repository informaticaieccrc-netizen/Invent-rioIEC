import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isPrivilegedProfile } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const isAdmin = isPrivilegedProfile((session.user as any)?.perfil)

    const count = await (prisma as any).solicitacoes_inventario.count({
      where: {
        status: 'pendente',
        ...(isAdmin ? {} : { solicitante_id: (session.user as any)?.id ?? '__sem_usuario__' }),
      },
    })

    return NextResponse.json({ count })
  } catch (error) {
    console.error('[GET /api/solicitacoes-inventario/count]', error)
    return NextResponse.json({ count: 0 }, { status: 500 })
  }
}
