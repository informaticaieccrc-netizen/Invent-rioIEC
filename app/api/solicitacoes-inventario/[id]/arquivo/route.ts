import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isPrivilegedProfile } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
type Props = { params: Promise<{ id: string }> }

function sanitizeDownloadName(fileName: string) {
  const sanitized = fileName
    .replace(/[/\\]/g, '_')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()

  return sanitized || 'arquivo'
}

function contentDisposition(fileName: string) {
  const safeName = sanitizeDownloadName(fileName)
  const asciiName = safeName
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_')

  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`
}

export async function GET(_: Request, { params }: Props) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { id } = await params
    const solicitacao = await (prisma as any).solicitacoes_inventario.findUnique({ where: { id } })
    if (!solicitacao) return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 })

    const userId = (session.user as any)?.id ?? null
    const isAdmin = isPrivilegedProfile((session.user as any)?.perfil)
    if (!isAdmin && solicitacao.solicitante_id !== userId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    if (solicitacao.tipo_recurso !== 'forum_arquivos' || solicitacao.acao !== 'UPLOAD') {
      return NextResponse.json({ error: 'Solicitação sem arquivo para download' }, { status: 404 })
    }

    const dados = solicitacao.dados_propostos
    const url = typeof dados?.url_publica === 'string' ? dados.url_publica : ''
    const nome = typeof dados?.nome_original === 'string' ? dados.nome_original : 'arquivo'
    const tipo = typeof dados?.tipo_arquivo === 'string' ? dados.tipo_arquivo : 'application/octet-stream'
    const tamanho = typeof dados?.tamanho_bytes === 'number' ? dados.tamanho_bytes : null

    if (!url) return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })

    const fileResponse = await fetch(url, { cache: 'no-store' })
    if (!fileResponse.ok || !fileResponse.body) {
      return NextResponse.json({ error: 'Arquivo indisponível' }, { status: 404 })
    }

    const headers = new Headers({
      'Content-Disposition': contentDisposition(nome),
      'Content-Type': tipo || fileResponse.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': 'private, max-age=0, must-revalidate',
    })
    const contentLength = fileResponse.headers.get('content-length') || (tamanho ? String(tamanho) : '')
    if (contentLength) headers.set('Content-Length', contentLength)

    return new NextResponse(fileResponse.body, { status: 200, headers })
  } catch (error) {
    console.error('[GET /api/solicitacoes-inventario/[id]/arquivo]', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
