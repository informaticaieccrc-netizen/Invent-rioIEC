import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { registrarAuditoria, getAuditSession } from '@/lib/audit'
import { validarColaboradorSemOutraMaquinaAtiva } from '@/lib/solicitacoes-inventario'

export const runtime = 'nodejs'

function isAllocationConflictError(error: unknown) {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('alocação ativa') ||
    message.includes('máquina ativa') ||
    message.includes('máquina administrativa ativa') ||
    (message.includes('já possui') && (message.includes('máquina') || message.includes('alocação')))
  )
}

export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { maquina_id, colaborador_id, tipo_uso } = await request.json()
    if (!maquina_id || !colaborador_id) {
      return NextResponse.json({ error: 'maquina_id e colaborador_id são obrigatórios' }, { status: 400 })
    }

    const { usuario_id, usuario_nome } = await getAuditSession()
    await validarColaboradorSemOutraMaquinaAtiva({ colaboradorId: colaborador_id, maquinaId: maquina_id, origem: 'administrativo' })

    const colaborador = await prisma.colaboradores.findUnique({
      where: { id: colaborador_id },
      select: { nome: true, setor_rel: { select: { nome: true } } },
    })
    const colaboradorSetor = colaborador?.setor_rel?.nome ?? null

    const alocacao = await prisma.alocacoes_maquinas.create({
      data: {
        maquina_id,
        colaborador_id,
        tipo_uso: tipo_uso || null,
        data_inicio: new Date(),
        ativo: true,
      },
    })

    await registrarAuditoria({
      tabela: 'alocacoes_maquinas',
      registro_id: maquina_id,
      acao: 'ALOCAR',
      descricao: `Alocada para ${colaborador?.nome ?? colaborador_id}${colaboradorSetor ? ` (${colaboradorSetor})` : ''}`,
      dados_novos: {
        alocacao_id: alocacao.id,
        colaborador_id,
        colaborador_nome: colaborador?.nome ?? null,
        colaborador_setor: colaboradorSetor,
        tipo_uso: tipo_uso || null,
      },
      usuario_id,
      usuario_nome,
    })

    return NextResponse.json(alocacao, { status: 201 })
  } catch (err) {
    console.error('[POST /api/alocacoes/maquinas]', err)
    if (isAllocationConflictError(err) && err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
