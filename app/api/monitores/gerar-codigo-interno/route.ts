import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ChecklistError, gerarCodigoInternoMonitor } from '@/lib/checklists-validacao'

export const runtime = 'nodejs'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  try {
    const codigo_interno = await gerarCodigoInternoMonitor()
    return NextResponse.json({ codigo_interno })
  } catch (error) {
    if (error instanceof ChecklistError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
