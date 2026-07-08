import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { delegate } from '@/lib/checklists-validacao'

export const runtime = 'nodejs'

type Props = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { id } = await params
  const data = await delegate('alocacoes_monitores').findMany({
    where: { maquina_id: id, ativo: true },
    include: { monitor: true, setor: true },
    orderBy: { criado_em: 'desc' },
  })
  return NextResponse.json({ data })
}
