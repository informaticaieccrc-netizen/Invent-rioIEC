'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'
import { Activity, ClipboardList, LayoutDashboard } from 'lucide-react'
import { MobileSectionNav } from '@/components/layout/mobile-section-nav'

type DashboardMobileView = 'overview' | 'ativos' | 'auditoria'

export function DashboardMobileSections({
  auditoria,
  ativos,
  overview,
}: {
  auditoria: ReactNode
  ativos: ReactNode
  overview: ReactNode
}) {
  const [mobileView, setMobileView] = useState<DashboardMobileView>('overview')

  return (
    <div className="space-y-6 pb-28 lg:pb-0">
      <section className={mobileView === 'overview' ? 'block animate-in fade-in slide-in-from-bottom-2 duration-200 lg:block' : 'hidden lg:block'}>
        {overview}
      </section>

      <section className={mobileView === 'ativos' ? 'block animate-in fade-in slide-in-from-bottom-2 duration-200 lg:block' : 'hidden lg:block'}>
        {ativos}
      </section>

      <section className={mobileView === 'auditoria' ? 'block animate-in fade-in slide-in-from-bottom-2 duration-200 lg:block' : 'hidden lg:block'}>
        {auditoria}
      </section>

      <MobileSectionNav
        ariaLabel="Navegação mobile do dashboard"
        value={mobileView}
        onViewChange={setMobileView}
        views={[
          { value: 'overview', label: 'Overview', icon: LayoutDashboard },
          { value: 'ativos', label: 'Ativos', icon: ClipboardList },
          { value: 'auditoria', label: 'Auditoria', icon: Activity },
        ]}
      />
    </div>
  )
}
