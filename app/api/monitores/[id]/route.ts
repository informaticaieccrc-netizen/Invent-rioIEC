import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { delegate } from '@/lib/checklists-validacao'
import { getAuditSession, registrarAuditoria } from '@/lib/audit'

export const runtime = 'nodejs'

type Props = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { id } = await params
  const monitor = await delegate('monitores').findUnique({ where: { id }, include: { alocacoes: { include: { maquina: true, setor: true } } } })
  if (!monitor) return NextResponse.json({ error: 'Monitor não encontrado' }, { status: 404 })
  return NextResponse.json(monitor)
}

export async function PATCH(request: Request, { params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { id } = await params
  const { usuario_id, usuario_nome } = await getAuditSession()
  const body = await request.json()
  const monitor = await delegate('monitores').update({
    where: { id },
    data: {
      codigo_interno: body?.codigo_interno,
      patrimonio: body?.patrimonio,
      serial: body?.serial,
      marca: body?.marca,
      modelo: body?.modelo,
      status: body?.status,
      atualizado_em: new Date(),
    },
  })
  await registrarAuditoria({ tabela: 'monitores', registro_id: id, acao: 'UPDATE', descricao: 'Monitor atualizado', dados_novos: monitor, usuario_id, usuario_nome })
  return NextResponse.json(monitor)
}
