'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'

export type ChecklistContextMetric = {
  helper?: string
  icon: LucideIcon
  label: string
  percent: number
  tone?: 'amber' | 'blue' | 'emerald' | 'slate' | 'violet'
  value: number | string
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function metricAccent(tone: ChecklistContextMetric['tone']) {
  if (tone === 'emerald') return 'rgb(16 185 129)'
  if (tone === 'amber') return 'rgb(245 158 11)'
  if (tone === 'violet') return 'rgb(139 92 246)'
  if (tone === 'slate') return 'rgb(100 116 139)'
  return 'rgb(37 99 235)'
}

export function ChecklistContextOverview({
  actions,
  className = '',
  description,
  eyebrow = 'Overview',
  metrics,
  title,
}: {
  actions?: ReactNode
  className?: string
  description?: string
  eyebrow?: string
  metrics: ChecklistContextMetric[]
  title: string
}) {
  return (
    <section className={`overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70 sm:p-5 ${className}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">{eyebrow}</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
          {description && <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
        {actions && <div className="min-w-0 max-w-full xl:shrink-0">{actions}</div>}
      </div>

      <div
        className="mt-5 grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}
      >
        {metrics.map(metric => {
          const safePercent = clampPercent(metric.percent)
          const displayValue = String(metric.value)
          const compactValue = displayValue.length > 4
          const Icon = metric.icon

          return (
            <motion.div
              key={metric.label}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="min-h-[106px] rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/40"
            >
              <div className="flex h-full items-center gap-3">
                <div
                  className="grid h-16 w-16 shrink-0 place-items-center rounded-full p-1"
                  style={{
                    background: `conic-gradient(${metricAccent(metric.tone)} ${safePercent * 3.6}deg, rgba(148, 163, 184, 0.22) 0deg)`,
                  }}
                  aria-label={`${metric.label}: ${safePercent}%`}
                >
                  <div className="grid h-full w-full place-items-center rounded-full bg-white shadow-inner dark:bg-slate-950">
                    <span className={`${compactValue ? 'text-xs' : 'text-lg'} max-w-12 truncate px-1 text-center font-black tracking-tight text-slate-900 dark:text-white`}>
                      {displayValue}
                    </span>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 truncate whitespace-nowrap">{metric.label}</span>
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {metric.helper ?? `${safePercent}% preenchido`}
                  </p>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}
