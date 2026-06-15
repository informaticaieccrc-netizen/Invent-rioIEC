import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { processSnowWorkbook } from '@/lib/snow/service'
import { SnowProcessingError } from '@/lib/snow/types'

export const runtime = 'nodejs'
export const maxDuration = 60

const SNOW_DEFAULT_ORIGEM_EMAIL = 'smcgti.snow@pucminas.br'

function isDevSession(session: Awaited<ReturnType<typeof getServerSession>>) {
  return (session?.user as any)?.perfil === 'dev'
}

function isXlsxFile(file: File) {
  return file.name.toLowerCase().endsWith('.xlsx')
}

function normalizeWorkbookBuffer(buffer: Buffer) {
  if (buffer.subarray(0, 2).toString('utf8') === 'PK') return buffer

  const text = buffer.toString('utf8').trim()
  if (!/^[A-Za-z0-9+/=\s]+$/.test(text)) return buffer

  try {
    const decoded = Buffer.from(text.replace(/\s+/g, ''), 'base64')
    return decoded.subarray(0, 2).toString('utf8') === 'PK' ? decoded : buffer
  } catch {
    return buffer
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!isDevSession(session)) {
    return NextResponse.json({ error: 'Disponível somente para perfil dev' }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Arquivo .xlsx obrigatório' }, { status: 400 })
    }

    if (!isXlsxFile(file)) {
      return NextResponse.json({ error: 'Extensão inválida. Envie um arquivo .xlsx' }, { status: 400 })
    }

    const buffer = normalizeWorkbookBuffer(Buffer.from(await file.arrayBuffer()))
    const result = await processSnowWorkbook(buffer, {
      nomeArquivo: file.name,
      origemEmail: String(formData.get('origem_email') ?? '') || SNOW_DEFAULT_ORIGEM_EMAIL,
      assuntoEmail: String(formData.get('assunto_email') ?? '') || null,
      recebidoEm: new Date(),
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof SnowProcessingError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error('[POST /api/snow/dev/processar-xlsx]', error)
    return NextResponse.json({ error: 'Erro interno ao processar relatório SNOW' }, { status: 500 })
  }
}
