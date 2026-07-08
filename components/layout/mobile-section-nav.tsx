'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { BarChart3, ListChecks, type LucideIcon } from 'lucide-react'

export type MobileSectionLink = {
  href: string
  icon: LucideIcon
  label: string
}

export type MobileSectionView<T extends string> = {
  icon: LucideIcon
  label: string
  value: T
}

export type InventoryMobileView = 'overview' | 'registros'

export const INVENTORY_MOBILE_VIEWS: MobileSectionView<InventoryMobileView>[] = [
  { value: 'overview', label: 'Overview', icon: BarChart3 },
  { value: 'registros', label: 'Registros', icon: ListChecks },
]

export function MobileSectionNav<T extends string>({
  ariaLabel = 'Navegação mobile',
  links = [],
  onViewChange,
  value,
  views,
}: {
  ariaLabel?: string
  links?: MobileSectionLink[]
  onViewChange?: (value: T) => void
  value?: T
  views?: MobileSectionView<T>[]
}) {
  const [platformMenuOpen, setPlatformMenuOpen] = useState(false)

  useEffect(() => {
    function syncMenuState(event?: Event) {
      const nextFromEvent = event instanceof CustomEvent
        ? Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open)
        : undefined

      setPlatformMenuOpen(nextFromEvent ?? document.documentElement.dataset.inventoryMobileMenu === 'open')
    }

    syncMenuState()
    window.addEventListener('inventory-mobile-menu-toggle', syncMenuState)
    return () => window.removeEventListener('inventory-mobile-menu-toggle', syncMenuState)
  }, [])

  if (links.length === 0 && (!views || views.length === 0 || !value)) {
    return null
  }

  function handleViewChange(next: T) {
    onViewChange?.(next)
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  return (
    <nav
      aria-label={ariaLabel}
      aria-hidden={platformMenuOpen}
      className={`fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/92 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 shadow-2xl shadow-slate-950/15 backdrop-blur-xl transition duration-200 dark:border-slate-800 dark:bg-slate-950/92 lg:hidden ${
        platformMenuOpen ? 'pointer-events-none translate-y-full opacity-0' : 'translate-y-0 opacity-100'
      }`}
    >
      <div className="mx-auto max-w-md">
        <div className="flex items-center gap-2">
          {links.length > 0 && (
            <div className="flex shrink-0 items-center rounded-2xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
              {links.map(({ href, icon: Icon, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex h-11 min-w-16 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[11px] font-semibold text-slate-500 transition active:scale-95 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-300"
                >
                  <Icon className="h-4 w-4" />
                  <span className="max-w-16 truncate">{label}</span>
                </Link>
              ))}
            </div>
          )}

          {views && views.length > 0 && value && (
            <div
              className="grid min-w-0 flex-1 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900"
              style={{ gridTemplateColumns: `repeat(${views.length}, minmax(4.5rem, 1fr))` }}
            >
              {views.map(({ icon: Icon, label, value: itemValue }) => {
                const active = value === itemValue
                return (
                  <button
                    key={itemValue}
                    type="button"
                    onClick={() => handleViewChange(itemValue)}
                    className={`relative flex h-11 min-w-0 items-center justify-center gap-1 rounded-xl px-1.5 text-[11px] font-bold transition active:scale-95 sm:gap-1.5 sm:px-2 sm:text-xs ${
                      active ? 'text-blue-700 dark:text-blue-200' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="mobile-section-nav-pill"
                        className="absolute inset-0 rounded-xl bg-white shadow-sm dark:bg-slate-800"
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                      />
                    )}
                    <Icon className="relative h-4 w-4 shrink-0" />
                    <span className="relative truncate whitespace-nowrap">{label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
