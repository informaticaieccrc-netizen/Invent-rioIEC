'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { Loader2, Server } from 'lucide-react'
import { toast } from 'sonner'

type FormData = {
  email: string
  senha: string
}

type RequestFormData = {
  nome: string
  codigo_pessoa: string
  email: string
  senha: string
}

const emailPattern = {
  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  message: 'E-mail inválido',
}

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'request'>('login')
  const [requestLoading, setRequestLoading] = useState(false)
  const [navigating, setNavigating] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>()
  const requestForm = useForm<RequestFormData>()

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    setError('')
    const result = await signIn('credentials', {
      email: data.email,
      senha: data.senha,
      redirect: false,
    })
    setLoading(false)
    if (result?.error) {
      setError('E-mail ou senha incorretos.')
    } else {
      setNavigating(true)
      router.push('/')
      router.refresh()
    }
  }

  const onRequestSubmit = async (data: RequestFormData) => {
    setRequestLoading(true)
    try {
      const res = await fetch('/api/auth/solicitar-acesso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: data.nome,
          codigo_pessoa: data.codigo_pessoa,
          email: data.email,
          senha: data.senha,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Não foi possível enviar a solicitação.')
        return
      }
      toast.success(json.message || 'Solicitação enviada. Aguarde aprovação para acessar.')
      requestForm.reset()
      setMode('login')
    } catch {
      toast.error('Erro ao enviar solicitação.')
    } finally {
      setRequestLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      {navigating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950">
          <div className="flex flex-col items-center text-center">
              <div className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-950/40">
                <Server className="h-8 w-8 text-white" />
              </div>
              <div className="h-8 w-8 rounded-full border-2 border-blue-400/30 border-t-blue-400 animate-spin" />
              <p className="mt-4 text-sm font-semibold text-white">Carregando plataforma</p>
              <p className="mt-1 text-xs text-slate-400">Preparando dashboard e permissões...</p>
          </div>
        </div>
      )}
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4 shadow-lg">
            <Server className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">IEC Inventário TI</h1>
          <p className="text-slate-400 text-sm mt-1">Sistema interno de gestão de ativos</p>
        </div>

        {/* Form card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8">
          <div className="flex rounded-lg bg-slate-100 dark:bg-slate-900 p-1 mb-6">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${mode === 'login' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => setMode('request')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${mode === 'request' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}
            >
              Solicitar acesso
            </button>
          </div>

          {mode === 'login' ? (
          <form
            key="login-form"
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-5"
          >
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Acessar sistema</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                E-mail
              </label>
              <input
                {...register('email', {
                  required: 'E-mail obrigatório',
                  pattern: emailPattern,
                })}
                type="email"
                placeholder="seu@email.com.br"
                autoComplete="email"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Senha
              </label>
              <input
                {...register('senha', { required: 'Senha obrigatória' })}
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
              />
              {errors.senha && <p className="text-red-500 text-xs mt-1">{errors.senha.message}</p>}
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-sm"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
          ) : (
          <form
            key="request-form"
            onSubmit={requestForm.handleSubmit(onRequestSubmit)}
            className="space-y-4"
          >
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Solicitar criação de usuário</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Nome completo</label>
              <input {...requestForm.register('nome', { required: 'Nome obrigatório', minLength: { value: 2, message: 'Nome obrigatório' } })} className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              {requestForm.formState.errors.nome && <p className="text-red-500 text-xs mt-1">{requestForm.formState.errors.nome.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Código de pessoa</label>
              <input {...requestForm.register('codigo_pessoa', { required: 'Código obrigatório' })} className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              {requestForm.formState.errors.codigo_pessoa && <p className="text-red-500 text-xs mt-1">{requestForm.formState.errors.codigo_pessoa.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">E-mail</label>
              <input {...requestForm.register('email', { required: 'E-mail obrigatório', pattern: emailPattern })} type="email" autoComplete="email" className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              {requestForm.formState.errors.email && <p className="text-red-500 text-xs mt-1">{requestForm.formState.errors.email.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Senha</label>
              <input {...requestForm.register('senha', { required: 'Senha obrigatória', minLength: { value: 6, message: 'Mínimo 6 caracteres' } })} type="password" autoComplete="new-password" className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              {requestForm.formState.errors.senha && <p className="text-red-500 text-xs mt-1">{requestForm.formState.errors.senha.message}</p>}
            </div>
            <button
              type="submit"
              disabled={requestLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-sm"
            >
              {requestLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {requestLoading ? 'Enviando...' : 'Enviar solicitação'}
            </button>
          </form>
          )}

          <p className="text-xs text-slate-400 text-center mt-6">
            Acesso restrito a colaboradores autorizados.
          </p>
        </div>
      </div>
    </div>
  )
}
