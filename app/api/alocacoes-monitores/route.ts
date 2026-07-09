import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { delegate } from '@/lib/checklists-validacao'
import { getAuditSession, registrarAuditoria } from '@/lib/audit'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const body = await request.json()
  const { usuario_id, usuario_nome } = await getAuditSession()
  const now = new Date()
  const anteriores = await delegate('alocacoes_monitores').findMany({ where: { monitor_id: body?.monitor_id, ativo: true } })
  await delegate('alocacoes_monitores').updateMany({ where: { monitor_id: body?.monitor_id, ativo: true }, data: { ativo: false, data_fim: now, atualizado_em: now } })
  for (const anterior of anteriores) {
    await registrarAuditoria({
      tabela: 'alocacoes_monitores',
      registro_id: anterior.id,
      acao: 'DESALOCAR',
      descricao: 'Monitor desalocado automaticamente para novo vínculo',
      dados_anteriores: anterior,
      dados_novos: { ...anterior, ativo: false, data_fim: now, atualizado_em: now },
      usuario_id,
      usuario_nome,
    })
  }
  const alocacao = await delegate('alocacoes_monitores').create({
    data: {
      monitor_id: body?.monitor_id,
      maquina_id: body?.maquina_id ?? null,
      setor_id: body?.setor_id ?? null,
      data_inicio: body?.data_inicio ? new Date(body.data_inicio) : now,
      ativo: true,
      criado_por: usuario_id,
    },
  })
  await registrarAuditoria({ tabela: 'alocacoes_monitores', registro_id: alocacao.id, acao: 'ALOCAR', descricao: 'Monitor alocado', dados_novos: alocacao, usuario_id, usuario_nome })
  return NextResponse.json(alocacao, { status: 201 })
}
