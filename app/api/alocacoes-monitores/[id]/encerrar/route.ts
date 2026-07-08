import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { delegate } from '@/lib/checklists-validacao'
import { getAuditSession, registrarAuditoria } from '@/lib/audit'

export const runtime = 'nodejs'

type Props = { params: Promise<{ id: string }> }

export async function PATCH(_request: Request, { params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { id } = await params
  const { usuario_id, usuario_nome } = await getAuditSession()
  const anterior = await delegate('alocacoes_monitores').findUnique({ where: { id } })
  const alocacao = await delegate('alocacoes_monitores').update({ where: { id }, data: { ativo: false, data_fim: new Date(), atualizado_em: new Date() } })
  await registrarAuditoria({
    tabela: 'alocacoes_monitores',
    registro_id: id,
    acao: 'DESALOCAR',
    descricao: 'Alocação de monitor encerrada',
    dados_anteriores: anterior,
    dados_novos: alocacao,
    usuario_id,
    usuario_nome,
  })
  return NextResponse.json(alocacao)
}
