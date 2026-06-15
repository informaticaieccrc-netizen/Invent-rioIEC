import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { authOptions, isPrivilegedProfile } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadArquivo } from '@/lib/supabase-storage'
import { registrarAuditoria } from '@/lib/audit'
import { sanitizeSolicitacaoInventarioResponse } from '@/lib/solicitacoes-inventario'

export const runtime = 'nodejs'
type Props = { params: Promise<{ id: string }> }

const MAX_SIZE = 20 * 1024 * 1024 // 20MB
const ALLOWED  = [
  'application/pdf',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]

function buildComentario(texto: unknown, autor: { id: string; nome: string }, papel: 'solicitante' | 'revisor') {
  const conteudo = typeof texto === 'string' ? texto.trim() : ''
  if (!conteudo) return null
  return {
    id: randomUUID(),
    autor_id: autor.id,
    autor_nome: autor.nome,
    papel,
    conteudo,
    created_at: new Date().toISOString(),
  }
}

function buildInlineArquivo(file: File, buffer: Buffer, prefix: string) {
  const safeExt = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin'
  const storagePath = `inline-upload/${prefix}/${Date.now()}-${randomUUID()}.${safeExt}`

  return {
    path: storagePath,
    url: `data:${file.type || 'application/octet-stream'};base64,${buffer.toString('base64')}`,
  }
}

export async function POST(request: Request, { params }: Props) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { id: pasta_id } = await params
    const userId   = (session.user as any).id as string
    const userName = session.user?.name ?? 'Usuário'
    const isAdmin  = isPrivilegedProfile((session.user as any)?.perfil)

    const pasta = await prisma.forum_pastas.findUnique({ where: { id: pasta_id } })
    if (!pasta) return NextResponse.json({ error: 'Pasta não encontrada' }, { status: 404 })

    const formData = await request.formData()
    const file     = formData.get('file') as File | null
    const comentario = formData.get('comentario')

    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Arquivo muito grande (máx 20MB)' }, { status: 400 })
    if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: 'Tipo de arquivo não permitido' }, { status: 400 })

    const buffer   = Buffer.from(await file.arrayBuffer())

    if (!isAdmin) {
      const { path, url } = buildInlineArquivo(file, buffer, pasta_id)
      const dadosPropostos = {
        pasta_id,
        pasta_nome: pasta.nome,
        tipo_arquivo: file.type,
        nome_original: file.name,
        nome_armazenado: path,
        tamanho_bytes: file.size,
        url_publica: url,
        usuario_id: userId,
        enviado_por_nome: userName,
      }
      const comentarioInicial = buildComentario(comentario, { id: userId, nome: userName }, 'solicitante')
      const solicitacao = await (prisma as any).solicitacoes_inventario.create({
        data: {
          status: 'pendente',
          tipo_recurso: 'forum_arquivos',
          recurso_id: null,
          acao: 'UPLOAD',
          dados_anteriores: { pasta_id, pasta_nome: pasta.nome } as Prisma.InputJsonValue,
          dados_propostos: dadosPropostos as Prisma.InputJsonValue,
          comentarios: (comentarioInicial ? [comentarioInicial] : []) as Prisma.InputJsonValue,
          solicitante_id: userId,
          solicitante_nome: userName,
        },
      })

      await registrarAuditoria({
        tabela: 'solicitacoes_inventario',
        registro_id: solicitacao.id,
        acao: 'CREATE',
        descricao: `Pedido de upload "${file.name}" criado para a pasta "${pasta.nome}"`,
        dados_novos: solicitacao as any,
        usuario_id: userId,
        usuario_nome: userName,
      })

      return NextResponse.json({
        pending_approval: true,
        solicitacao: sanitizeSolicitacaoInventarioResponse(solicitacao),
      }, { status: 202 })
    }

    let uploaded = null
    try {
      uploaded = await uploadArquivo(buffer, file.name, file.type, pasta_id)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (!message.includes('Missing Supabase environment variables')) throw error
      uploaded = buildInlineArquivo(file, buffer, pasta_id)
    }

    const arquivo = await prisma.forum_arquivos.create({
      data: {
        pasta_id,
        tipo_arquivo:   file.type,
        nome_original:  file.name,
        nome_armazenado: uploaded.path,
        tamanho_bytes:  file.size,
        url_publica:    uploaded.url,
        usuario_id:     userId,
      },
    })

    await registrarAuditoria({
      tabela: 'forum_arquivos',
      registro_id: arquivo.id,
      acao: 'CREATE',
      descricao: `Arquivo "${arquivo.nome_original}" enviado para a pasta "${pasta.nome}"`,
      dados_novos: arquivo as any,
      usuario_id: userId,
      usuario_nome: userName,
    })

    return NextResponse.json(arquivo, { status: 201 })
  } catch (err) {
    console.error('[POST /api/forum/pastas/[id]/upload]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
