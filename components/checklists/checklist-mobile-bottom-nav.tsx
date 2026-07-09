'use client'

import {
  MobileSectionNav,
  type MobileSectionLink,
  type MobileSectionView,
} from '@/components/layout/mobile-section-nav'

type LinkItem = MobileSectionLink
type ViewItem<T extends string> = MobileSectionView<T>

export function ChecklistMobileBottomNav<T extends string>({
  links,
  onViewChange,
  value,
  views,
}: {
  links: LinkItem[]
  onViewChange?: (value: T) => void
  value?: T
  views?: ViewItem<T>[]
}) {
  return (
    <MobileSectionNav
      ariaLabel="Navegação mobile do checklist"
      links={links}
      onViewChange={onViewChange}
      value={value}
      views={views}
    />
  )
}
