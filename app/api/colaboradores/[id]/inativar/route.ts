import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { registrarAuditoria, getAuditSession } from '@/lib/audit'

export const runtime = 'nodejs'
type Props = { params: Promise<{ id: string }> }

function labelAtivo(prefixo: string, label: string | null | undefined) {
  return `${prefixo} ${label?.trim() || 'sem identificação'}`
}

export async function POST(_: Request, { params }: Props) {
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    const { id } = await params
    const { usuario_id, usuario_nome } = await getAuditSession()

    const colaborador = await prisma.colaboradores.findUnique({ where: { id } })
    if (!colaborador) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  // Buscar todas as alocações ativas antes de desativar
  const [maquinas, notebooks, aparelhos, ramais] = await Promise.all([
    prisma.alocacoes_maquinas.findMany({
      where: { colaborador_id: id, ativo: true },
      include: { maquina: { select: { id: true, endereco_ip: true, nome_host: true } } },
    }),
    prisma.alocacoes_notebooks.findMany({
      where: { colaborador_id: id, ativo: true },
      include: { notebook: { select: { id: true, numero_patrimonio: true } } },
    }),
    prisma.alocacoes_aparelhos.findMany({
      where: { colaborador_id: id, ativo: true },
      include: { aparelho: { select: { id: true, modelo: true } } },
    }),
    prisma.alocacoes_ramais.findMany({
      where: { colaborador_id: id, ativo: true },
      include: { ramal: { select: { id: true, numero_ramal: true } } },
    }),
  ])

  const agora = new Date()

  // Desativar todas as alocações em paralelo
  await Promise.all([
    prisma.alocacoes_maquinas.updateMany({
      where: { colaborador_id: id, ativo: true },
      data: { ativo: false, data_fim: agora },
    }),
    prisma.alocacoes_notebooks.updateMany({
      where: { colaborador_id: id, ativo: true },
      data: { ativo: false, data_fim: agora },
    }),
    prisma.alocacoes_aparelhos.updateMany({
      where: { colaborador_id: id, ativo: true },
      data: { ativo: false, data_fim: agora },
    }),
    prisma.alocacoes_ramais.updateMany({
      where: { colaborador_id: id, ativo: true },
      data: { ativo: false, data_fim: agora },
    }),
  ])

  // Inativar o colaborador
  await prisma.colaboradores.update({
    where: { id },
    data: { status: 'Inativo' },
  })

  // Montar labels descritivos para o log
  const labelsDesalocados: string[] = [
    ...maquinas.map(a => labelAtivo('Máquina', a.maquina?.endereco_ip ?? a.maquina?.nome_host)),
    ...notebooks.map(a => labelAtivo('Notebook', a.notebook?.numero_patrimonio)),
    ...aparelhos.map(a => labelAtivo('Aparelho', a.aparelho?.modelo)),
    ...ramais.map(a => labelAtivo('Ramal', a.ramal?.numero_ramal)),
  ]

  const totalAlocacoes = labelsDesalocados.length

  // Registro 1: inativação do colaborador
  await registrarAuditoria({
    tabela: 'colaboradores',
    registro_id: id,
    acao: 'UPDATE',
    descricao: `Colaborador "${colaborador.nome}": Ativo → Inativo`,
    dados_anteriores: { status: 'Ativo' },
    dados_novos: { status: 'Inativo' },
    usuario_id,
    usuario_nome,
  })

  // Registro 2: desalocações em massa (apenas se havia alocações)
  if (totalAlocacoes > 0) {
    await Promise.all([
      ...maquinas.map(a => registrarAuditoria({
        tabela: 'alocacoes_maquinas',
        registro_id: a.maquina_id ?? a.id,
        acao: 'DESALOCAR' as const,
        descricao: `${labelAtivo('Máquina', a.maquina?.endereco_ip ?? a.maquina?.nome_host)} desalocada automaticamente ao inativar ${colaborador.nome}`,
        dados_anteriores: {
          alocacao_id: a.id,
          maquina_id: a.maquina_id,
          maquina_label: a.maquina?.endereco_ip ?? a.maquina?.nome_host ?? null,
          colaborador_id: id,
          colaborador_nome: colaborador.nome,
          data_inicio: a.data_inicio,
          ativo: true,
        },
        dados_novos: {
          alocacao_id: a.id,
          maquina_id: a.maquina_id,
          colaborador_id: id,
          colaborador_nome: colaborador.nome,
          data_fim: agora,
          ativo: false,
        },
        usuario_id,
        usuario_nome,
      })),
      ...notebooks.map(a => registrarAuditoria({
        tabela: 'alocacoes_notebooks',
        registro_id: a.notebook_id ?? a.id,
        acao: 'DESALOCAR' as const,
        descricao: `${labelAtivo('Notebook', a.notebook?.numero_patrimonio)} desalocado automaticamente ao inativar ${colaborador.nome}`,
        dados_anteriores: {
          alocacao_id: a.id,
          notebook_id: a.notebook_id,
          notebook_label: a.notebook?.numero_patrimonio ?? null,
          colaborador_id: id,
          colaborador_nome: colaborador.nome,
          data_inicio: a.data_inicio,
          ativo: true,
        },
        dados_novos: {
          alocacao_id: a.id,
          notebook_id: a.notebook_id,
          colaborador_id: id,
          colaborador_nome: colaborador.nome,
          data_fim: agora,
          ativo: false,
        },
        usuario_id,
        usuario_nome,
      })),
      ...aparelhos.map(a => registrarAuditoria({
        tabela: 'alocacoes_aparelhos',
        registro_id: a.aparelho_id ?? a.id,
        acao: 'DESALOCAR' as const,
        descricao: `${labelAtivo('Aparelho', a.aparelho?.modelo)} desalocado automaticamente ao inativar ${colaborador.nome}`,
        dados_anteriores: {
          alocacao_id: a.id,
          aparelho_id: a.aparelho_id,
          aparelho_label: a.aparelho?.modelo ?? null,
          colaborador_id: id,
          colaborador_nome: colaborador.nome,
          data_inicio: a.data_inicio,
          ativo: true,
        },
        dados_novos: {
          alocacao_id: a.id,
          aparelho_id: a.aparelho_id,
          colaborador_id: id,
          colaborador_nome: colaborador.nome,
          data_fim: agora,
          ativo: false,
        },
        usuario_id,
        usuario_nome,
      })),
      ...ramais.map(a => registrarAuditoria({
        tabela: 'alocacoes_ramais',
        registro_id: a.ramal_id ?? a.id,
        acao: 'DESALOCAR' as const,
        descricao: `${labelAtivo('Ramal', a.ramal?.numero_ramal)} desalocado automaticamente ao inativar ${colaborador.nome}`,
        dados_anteriores: {
          alocacao_id: a.id,
          ramal_id: a.ramal_id,
          ramal_label: a.ramal?.numero_ramal ?? null,
          colaborador_id: id,
          colaborador_nome: colaborador.nome,
          data_inicio: a.data_inicio,
          ativo: true,
        },
        dados_novos: {
          alocacao_id: a.id,
          ramal_id: a.ramal_id,
          colaborador_id: id,
          colaborador_nome: colaborador.nome,
          data_fim: agora,
          ativo: false,
        },
        usuario_id,
        usuario_nome,
      })),
    ])

    await registrarAuditoria({
      tabela: 'colaboradores',
      registro_id: id,
      acao: 'DESALOCAR',
      descricao: `${totalAlocacoes} alocação${totalAlocacoes > 1 ? 'ões' : ''} desalocada${totalAlocacoes > 1 ? 's' : ''}: ${labelsDesalocados.join(', ')}`,
      dados_anteriores: {
        maquinas: maquinas.map(a => ({ id: a.id, ip: a.maquina?.endereco_ip })),
        notebooks: notebooks.map(a => ({ id: a.id, patrimonio: a.notebook?.numero_patrimonio })),
        aparelhos: aparelhos.map(a => ({ id: a.id, modelo: a.aparelho?.modelo })),
        ramais: ramais.map(a => ({ id: a.id, numero: a.ramal?.numero_ramal })),
      },
      dados_novos: null,
      usuario_id,
      usuario_nome,
    })
  }

    return NextResponse.json({
      ok: true,
      totalDesalocados: totalAlocacoes,
      desalocados: labelsDesalocados,
    })
  } catch (error) {
    console.error('[POST /api/colaboradores/[id]/inativar]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao inativar colaborador' },
      { status: 500 },
    )
  }
}
