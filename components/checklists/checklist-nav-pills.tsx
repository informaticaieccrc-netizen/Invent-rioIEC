'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

type Pill = {
  href?: string
  label: string
}

export function ChecklistNavPills({ className = '', items }: { className?: string; items: Pill[] }) {
  return (
    <nav className={`-mx-3 mb-3 overflow-x-auto px-3 sm:mx-0 sm:mb-4 sm:px-0 ${className}`} aria-label="Navegação do checklist">
      <div className="flex w-max items-center gap-2 text-sm">
      {items.map((item, index) => {
        const current = index === items.length - 1
        return (
          <div key={`${item.label}-${index}`} className="flex items-center gap-2">
            {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-500" />}
            {item.href && !current ? (
              <Link
                href={item.href}
                className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600 transition hover:border-blue-300 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-800 dark:hover:text-blue-300"
              >
                {item.label}
              </Link>
            ) : (
              <span className="whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 font-medium text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
                {item.label}
              </span>
            )}
          </div>
        )
      })}
      </div>
    </nav>
  )
}
