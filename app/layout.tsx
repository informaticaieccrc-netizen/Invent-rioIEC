import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from 'sonner'

export const metadata: Metadata = {
  title: 'IEC — Inventário de TI',
  description: 'Sistema de controle de inventário de TI do IEC',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <body className="font-sans">
        <Providers>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              duration: 4000,
              classNames: {
                toast: 'font-sans text-sm',
                actionButton: 'bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900',
                cancelButton: 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400',
              },
            }}
            richColors
          />
        </Providers>
      </body>
    </html>
  )
}
