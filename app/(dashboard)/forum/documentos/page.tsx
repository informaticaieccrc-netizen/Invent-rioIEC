'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Folder, FolderOpen, FileText, FileImage, File,
  ChevronRight, Plus, Upload, Trash2, Loader2,
  Home, Download, X, Pencil, FolderPlus,
} from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import { pushInspectHistory } from '@/lib/navigation-context'
import { useSolicitacaoInventarioConfirm } from '@/components/solicitacoes-inventario/solicitacao-confirm-provider'
import {
  readPedidoMaloteContext,
  updatePedidoMaloteAfterSubmit,
} from '@/lib/solicitacoes-inventario-client'

interface Pasta {
  id: string
  nome: string
  descricao: string | null
  cor: string | null
  parent_id: string | null
  created_at: string | null
  _count: { filhos: number; arquivos: number }
}

interface Arquivo {
  id: string
  nome_original: string
  tipo_arquivo: string
  tamanho_bytes: number
  url_publica: string
  usuario_id: string | null
  enviado_por_nome: string
  created_at: string | null
}

const COR_OPTIONS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#64748b',
]

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(mime?: string | null) {
  if (!mime) return <File className="w-5 h-5 text-slate-400" />
  if (mime.startsWith('image/'))   return <FileImage className="w-5 h-5 text-blue-500" />
  if (mime === 'application/pdf')  return <FileText className="w-5 h-5 text-red-500" />
  return <File className="w-5 h-5 text-slate-400" />
}

function getDownloadHref(arq: Arquivo) {
  return `/api/forum/arquivos/${arq.id}/download/${encodeURIComponent(arq.nome_original)}`
}

function getPreviewHref(arq: Arquivo) {
  return `/api/forum/arquivos/${arq.id}/preview/${encodeURIComponent(arq.nome_original)}`
}

export default function DocumentosPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const pastaParam = searchParams.get('pasta')
  const perfil = (session?.user as any)?.perfil as string
  const isAdmin = perfil === 'admin' || perfil === 'dev'
  const confirmSolicitacao = useSolicitacaoInventarioConfirm()

  const [pastas, setPastas]         = useState<Pasta[]>([])
  const [arquivos, setArquivos]     = useState<Arquivo[]>([])
  const [breadcrumb, setBreadcrumb] = useState<{ id: string; nome: string }[]>([])
  const [currentId, setCurrentId]   = useState<string | null>(pastaParam)
  const [loading, setLoading]       = useState(true)

  // Modais
  const [showNovaPasta, setShowNovaPasta]   = useState(false)
  const [showUpload, setShowUpload]         = useState(false)
  const [editandoPasta, setEditandoPasta]   = useState<Pasta | null>(null)
  const [confirmDelete, setConfirmDelete]   = useState<{ tipo: 'pasta' | 'arquivo'; id: string; nome: string } | null>(null)

  // Form nova pasta
  const [novaNome, setNovaNome]   = useState('')
  const [novaDesc, setNovaDesc]   = useState('')
  const [novaCor, setNovaCor]     = useState('#3b82f6')
  const [savingPasta, setSavingPasta] = useState(false)

  // Upload
  const [uploadFile, setUploadFile]   = useState<File | null>(null)
  const [uploadDesc, setUploadDesc]   = useState('')
  const [uploading, setUploading]     = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async (id: string | null = currentId) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (id) params.set('parent_id', id)
      const res  = await fetch(`/api/forum/pastas?${params}`)
      const json = await res.json()
      setPastas(json.pastas || [])
      setArquivos(json.arquivos || [])
      setBreadcrumb(json.breadcrumb || [])
    } catch { toast.error('Erro ao carregar.') }
    finally { setLoading(false) }
  }, [currentId])

  useEffect(() => {
    setCurrentId(pastaParam)
  }, [pastaParam])

  useEffect(() => { load(currentId) }, [currentId])

  useEffect(() => {
    const currentFolder = currentId ? breadcrumb[breadcrumb.length - 1] : null
    const href = currentId ? `/forum/documentos?pasta=${currentId}` : '/forum/documentos'

    pushInspectHistory(window.sessionStorage, {
      path: '/forum/documentos',
      inspectId: currentId ?? 'documentos',
      type: 'forum_documentos',
      label: 'Documentos',
      title: currentFolder?.nome ?? 'Documentos',
      subtitle: currentId ? 'Pasta do fórum' : 'Arquivos e tutoriais do setor de TI',
      href,
      timestamp: Date.now(),
    })
  }, [breadcrumb, currentId])

  function navigate(id: string | null) {
    const href = id ? `/forum/documentos?pasta=${id}` : '/forum/documentos'
    router.push(href, { scroll: false })
  }

  // Criar pasta
  async function handleCriarPasta() {
    if (!novaNome.trim()) return
    setSavingPasta(true)
    try {
      const res = await fetch('/api/forum/pastas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novaNome, descricao: novaDesc, parent_id: currentId, cor: novaCor }),
      })
      if (!res.ok) throw new Error()
      toast.success('Pasta criada!')
      setShowNovaPasta(false)
      setNovaNome(''); setNovaDesc(''); setNovaCor('#3b82f6')
      load(currentId)
    } catch { toast.error('Erro ao criar pasta.') }
    finally { setSavingPasta(false) }
  }

  // Editar pasta
  async function handleSalvarEdicao() {
    if (!editandoPasta) return
    setSavingPasta(true)
    try {
      await fetch(`/api/forum/pastas/${editandoPasta.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novaNome, descricao: novaDesc, cor: novaCor }),
      })
      toast.success('Pasta atualizada!')
      setEditandoPasta(null)
      setNovaNome(''); setNovaDesc(''); setNovaCor('#3b82f6')
      load(currentId)
    } catch { toast.error('Erro ao salvar.') }
    finally { setSavingPasta(false) }
  }

  // Upload
  async function handleUpload() {
    if (!uploadFile || !currentId) return
    let comentario = uploadDesc
    let adicionarMaisPedidos = false
    if (!isAdmin) {
      const solicitacao = await confirmSolicitacao({
        title: 'Solicitar aprovação de upload?',
        description: 'O arquivo será enviado para revisão e só ficará disponível em Documentos após aprovação administrativa.',
      })
      if (!solicitacao.confirmed) return
      comentario = solicitacao.comentario || uploadDesc
      adicionarMaisPedidos = solicitacao.adicionarMaisPedidos
    }

    setUploading(true)
    setUploadProgress(10)
    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      if (uploadDesc) formData.append('descricao', uploadDesc)
      if (comentario) formData.append('comentario', comentario)
      const maloteContext = readPedidoMaloteContext()
      if (maloteContext) formData.append('pedido_pai_id', maloteContext.pedido_pai_id)

      setUploadProgress(40)
      const res = await fetch(`/api/forum/pastas/${currentId}/upload`, {
        method: 'POST',
        body: formData,
      })
      setUploadProgress(90)

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erro no upload')
      }

      setUploadProgress(100)
      const json = await res.json().catch(() => ({}))
      if (json.pending_approval) {
        updatePedidoMaloteAfterSubmit(adicionarMaisPedidos, json.solicitacao, uploadFile.name)
      }
      toast.success(
        json.pending_approval
          ? adicionarMaisPedidos ? 'Pedido de upload enviado. Malote ativo para o próximo pedido.' : 'Pedido de upload enviado para aprovação.'
          : 'Arquivo enviado!',
      )
      setShowUpload(false)
      setUploadFile(null)
      setUploadDesc('')
      load(currentId)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar arquivo.')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  // Deletar
  async function handleDelete() {
    if (!confirmDelete) return
    try {
      const url = confirmDelete.tipo === 'pasta'
        ? `/api/forum/pastas/${confirmDelete.id}`
        : `/api/forum/arquivos/${confirmDelete.id}`
      await fetch(url, { method: 'DELETE' })
      toast.success(`${confirmDelete.tipo === 'pasta' ? 'Pasta' : 'Arquivo'} removido.`)
      setConfirmDelete(null)
      load(currentId)
    } catch { toast.error('Erro ao remover.') }
  }

  const inp = "w-full px-3 py-2 text-sm border border-slate-700 rounded-lg bg-slate-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white">Documentos</h1>
          <p className="mt-0.5 text-xs text-slate-400">
            Arquivos e tutoriais do setor de TI
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button type="button" onClick={() => { setShowNovaPasta(true); setEditandoPasta(null); setNovaNome(''); setNovaDesc(''); setNovaCor('#3b82f6') }}
              className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800">
              <FolderPlus className="w-4 h-4" /> Nova pasta
            </button>
          )}
          {currentId && (
            <button type="button" onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition">
              <Upload className="w-4 h-4" /> Enviar arquivo
            </button>
          )}
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm mb-4 flex-wrap">
        <button type="button" onClick={() => navigate(null)}
          className="flex items-center gap-1 text-slate-500 transition hover:text-blue-400">
          <Home className="w-3.5 h-3.5" /> Início
        </button>
        {breadcrumb.map(b => (
          <span key={b.id} className="flex items-center gap-1">
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <button type="button" onClick={() => navigate(b.id)}
              className="text-slate-500 transition hover:text-blue-400">
              {b.nome}
            </button>
          </span>
        ))}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-800" />
          ))}
        </div>
      ) : pastas.length === 0 && arquivos.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Folder className="w-14 h-14 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">Pasta vazia</p>
          <p className="text-xs mt-1">
            {isAdmin ? 'Crie uma nova pasta ou envie um arquivo.' : 'Nenhum arquivo aqui ainda.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pastas */}
          {pastas.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                Pastas ({pastas.length})
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {pastas.map(pasta => (
                  <div key={pasta.id} className="group relative">
                    <button type="button" onDoubleClick={() => navigate(pasta.id)}
                      onClick={() => navigate(pasta.id)}
                      className="relative flex aspect-[1.28] w-full flex-col items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900 p-4 text-center transition hover:border-slate-700 hover:shadow-sm">
                      {(pasta._count.filhos + pasta._count.arquivos) > 0 && (
                        <span className="absolute right-2 top-2 rounded-full border border-slate-800 bg-slate-950 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">
                          {pasta._count.filhos + pasta._count.arquivos}
                        </span>
                      )}
                      <div className="flex h-12 w-12 items-center justify-center">
                        <Folder className="h-10 w-10" style={{ color: pasta.cor ?? '#3b82f6' }} />
                      </div>
                      <span className="block w-full truncate text-xs font-medium text-slate-300">{pasta.nome}</span>
                      {pasta.descricao && (
                        <span className="block w-full truncate text-[10px] text-slate-400">{pasta.descricao}</span>
                      )}
                    </button>
                    {isAdmin && (
                      <div className="absolute top-1.5 right-1.5 hidden group-hover:flex gap-1">
                        <button type="button" onClick={e => {
                          e.stopPropagation()
                          setEditandoPasta(pasta)
                          setNovaNome(pasta.nome)
                          setNovaDesc(pasta.descricao ?? '')
                          setNovaCor(pasta.cor ?? '#3b82f6')
                          setShowNovaPasta(true)
                        }} className="rounded-md border border-slate-700 bg-slate-800 p-1 text-slate-400 shadow-sm transition hover:text-blue-500">
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button type="button" onClick={e => {
                          e.stopPropagation()
                          setConfirmDelete({ tipo: 'pasta', id: pasta.id, nome: pasta.nome })
                        }} className="rounded-md border border-slate-700 bg-slate-800 p-1 text-slate-400 shadow-sm transition hover:text-red-500">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Arquivos */}
          {arquivos.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                Arquivos ({arquivos.length})
              </p>
              <div className="overflow-hidden rounded-xl border border-slate-800">
                {/* Header */}
                <div className="hidden grid-cols-12 gap-4 bg-slate-800/50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 md:grid">
                  <span className="col-span-6">Nome</span>
                  <span className="col-span-2">Enviado por</span>
                  <span className="col-span-2">Data</span>
                  <span className="col-span-2">Tamanho</span>
                </div>
                {arquivos.map((arq, i) => (
                  <div key={arq.id}
                    className={`group grid gap-2 border-t border-slate-800 px-4 py-3 md:grid-cols-12 md:items-center md:gap-4 ${i % 2 === 1 ? 'bg-slate-800/20' : ''}`}>
                    <div className="flex min-w-0 items-center gap-2.5 md:col-span-6">
                      {getFileIcon(arq.tipo_arquivo)}
                      <div className="min-w-0">
                        <a href={getPreviewHref(arq)} target="_blank" rel="noopener noreferrer"
                          className="block truncate text-sm font-medium text-slate-200 transition hover:text-blue-400">
                          {arq.nome_original}
                        </a>
                      </div>
                    </div>
                    <span className="truncate text-xs text-slate-500 md:col-span-2">{arq.enviado_por_nome}</span>
                    <span className="text-xs text-slate-400 md:col-span-2">{formatDate(arq.created_at)}</span>
                    <div className="flex items-center justify-between md:col-span-2">
                      <span className="text-xs text-slate-400">{formatSize(arq.tamanho_bytes)}</span>
                      <div className="flex gap-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
                        <a href={getDownloadHref(arq)} download={arq.nome_original}
                          className="p-1 rounded text-slate-400 hover:text-blue-500 transition">
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        <button type="button" onClick={() => setConfirmDelete({ tipo: 'arquivo', id: arq.id, nome: arq.nome_original })}
                          className="p-1 rounded text-slate-400 hover:text-red-500 transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Nova/Editar Pasta */}
      {showNovaPasta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setShowNovaPasta(false); setEditandoPasta(null) }} />
          <div className="relative mx-4 w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h2 className="mb-4 text-base font-semibold text-white">
              {editandoPasta ? 'Editar pasta' : 'Nova pasta'}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Nome *</label>
                <input value={novaNome} onChange={e => setNovaNome(e.target.value)} className={inp} placeholder="Ex: Tutoriais" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Descrição</label>
                <input value={novaDesc} onChange={e => setNovaDesc(e.target.value)} className={inp} placeholder="Opcional" />
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-400">Cor</label>
                <div className="flex gap-2 flex-wrap">
                  {COR_OPTIONS.map(cor => (
                    <button key={cor} type="button" onClick={() => setNovaCor(cor)}
                      className={`w-7 h-7 rounded-full transition ${novaCor === cor ? 'ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900 scale-110' : 'hover:scale-105'}`}
                      style={{ backgroundColor: cor }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => { setShowNovaPasta(false); setEditandoPasta(null) }}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800">
                Cancelar
              </button>
              <button type="button" onClick={editandoPasta ? handleSalvarEdicao : handleCriarPasta} disabled={savingPasta || !novaNome.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60 transition">
                {savingPasta && <Loader2 className="w-4 h-4 animate-spin" />}
                {editandoPasta ? 'Salvar' : 'Criar pasta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Upload */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !uploading && setShowUpload(false)} />
          <div className="relative mx-4 w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h2 className="mb-4 text-base font-semibold text-white">Enviar arquivo</h2>
            <div className="space-y-3">
              {/* Drop zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  const f = e.dataTransfer.files[0]
                  if (f) setUploadFile(f)
                }}
                className="cursor-pointer rounded-xl border-2 border-dashed border-slate-700 p-6 text-center transition hover:border-blue-600">
                <input ref={fileInputRef} type="file" className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={e => setUploadFile(e.target.files?.[0] ?? null)} />
                {uploadFile ? (
                  <div className="flex items-center justify-center gap-2">
                    {getFileIcon(uploadFile.type)}
                    <div className="text-left min-w-0">
                      <p className="truncate text-sm font-medium text-slate-300">{uploadFile.name}</p>
                      <p className="text-xs text-slate-400">{formatSize(uploadFile.size)}</p>
                    </div>
                    <button type="button" onClick={e => { e.stopPropagation(); setUploadFile(null) }}
                      className="text-slate-400 hover:text-red-500 transition ml-1">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="mx-auto mb-2 h-8 w-8 text-slate-600" />
                    <p className="text-sm text-slate-400">Clique ou arraste o arquivo</p>
                    <p className="text-[11px] text-slate-400 mt-1">PDF, imagens, Word, Excel, TXT — máx 20MB</p>
                  </>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Descrição</label>
                <input value={uploadDesc} onChange={e => setUploadDesc(e.target.value)} className={inp} placeholder="Opcional" />
              </div>
              {uploading && uploadProgress > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Enviando...</span><span>{uploadProgress}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => setShowUpload(false)} disabled={uploading}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-60">
                Cancelar
              </button>
              <button type="button" onClick={handleUpload} disabled={!uploadFile || uploading}
                className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60 transition">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative mx-4 w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h2 className="mb-2 text-base font-semibold text-white">
              Remover {confirmDelete.tipo === 'pasta' ? 'pasta' : 'arquivo'}
            </h2>
            <p className="mb-5 text-sm text-slate-400">
              Remover <strong>"{confirmDelete.nome}"</strong>?
              {confirmDelete.tipo === 'pasta' && ' Todo o conteúdo interno será removido permanentemente.'}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800">
                Cancelar
              </button>
              <button type="button" onClick={handleDelete}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition">
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
