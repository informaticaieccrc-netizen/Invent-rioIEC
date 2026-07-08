'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useState, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import {
  LayoutDashboard, Users, Monitor, MonitorCheck, Laptop, Smartphone, Printer,
  Phone, Server, ScrollText, ChevronLeft,
  PanelLeftOpen, LogOut, Menu, X, UserCog, Loader2,
  ChevronDown,
  MessageSquare,
  FolderOpen,
  GitPullRequest,
  FileSpreadsheet,
  CalendarCheck,
  ClipboardCheck
} from 'lucide-react'
import { cn } from '@/lib/utils'

type NavItem = {
  href: string
  label: string
  icon: typeof LayoutDashboard
  adminOnly?: boolean
  adminStrict?: boolean
  mobileHidden?: boolean
}

type NavGroup = {
  label: string
  icon: typeof LayoutDashboard
  items: NavItem[]
  mobileHidden?: boolean
}

const primaryNavItem: NavItem = { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }

const navGroups: NavGroup[] = [
  {
    label: 'Alocações',
    icon: Monitor,
    items: [
      { href: '/maquinas', label: 'Máquinas', icon: Monitor },
      { href: '/monitores', label: 'Monitores', icon: MonitorCheck },
      { href: '/notebooks', label: 'Notebooks', icon: Laptop },
      { href: '/aparelhos', label: 'Aparelhos', icon: Smartphone },
      { href: '/ramais', label: 'Ramais', icon: Phone },
    ],
  },
  {
    label: 'Dispositivos setoriais',
    icon: Printer,
    items: [
      { href: '/impressoras', label: 'Impressoras', icon: Printer },
      { href: '/racks', label: 'Racks', icon: Server },
    ],
  },
  {
    label: 'Pessoas e acesso',
    icon: Users,
    items: [
      { href: '/colaboradores', label: 'Colaboradores', icon: Users },
      { href: '/usuarios', label: 'Usuários', icon: UserCog, adminOnly: true },
    ],
  },
  {
    label: 'Forum',
    icon: MessageSquare,
    items: [
      { href: '/forum', label: 'Fórum', icon: ScrollText },
      { href: '/forum/documentos', label: 'Documentos', icon: FolderOpen },
    ],
  },
  {
    label: 'Serviços',
    icon: ScrollText,
    mobileHidden: true,
    items: [
      { href: '/movimentacoes', label: 'Auditoria', icon: ScrollText },
      { href: '/pedidos', label: 'Pedidos', icon: GitPullRequest },
      { href: '/snow', label: 'Snow', icon: FileSpreadsheet },
    ],
  },
  {
    label: 'Checklists',
    icon: CalendarCheck,
    items: [
      { href: '/checklists-validacao', label: 'Checklists', icon: CalendarCheck },
      { href: '/checklists-validacao/revisao', label: 'Revisão', icon: ClipboardCheck, adminOnly: true, mobileHidden: true },
    ],
  },
]

function isNavItemActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'

  if (href === '/forum') {
    return pathname === '/forum' || (pathname.startsWith('/forum/') && !pathname.startsWith('/forum/documentos'))
  }

  if (href === '/checklists-validacao/revisao') {
    return pathname === href || /^\/checklists-validacao\/solicitacoes\/[^/]+\/revisao$/.test(pathname)
  }

  if (href === '/checklists-validacao') {
    return pathname === href || /^\/checklists-validacao\/(?!revisao(?:\/|$))[^/]+$/.test(pathname) || /^\/checklists-validacao\/solicitacoes\/[^/]+$/.test(pathname)
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [pendingPedidosCount, setPendingPedidosCount] = useState(0)
  const [pendingSnowCount, setPendingSnowCount] = useState(0)
  const previousPathnameRef = useRef(pathname)
  const [openGroup, setOpenGroup] = useState<string | null>(() => {
    return navGroups.find(group => group.items.some(item => isNavItemActive(pathname, item.href)))?.label ?? 'Alocações'
  })

  const perfil = session?.user?.perfil
  const canManageUsers = perfil === 'admin' || perfil === 'dev'
  const isStrictAdmin = perfil === 'admin' || perfil === 'dev'
  const navGroupsFiltrados = navGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item => {
        if (item.adminStrict) return isStrictAdmin
        return !item.adminOnly || canManageUsers
      }),
    }))
    .filter(group => group.items.length > 0)

  useEffect(() => {
    if (!session?.user) return
    let cancelled = false
    async function loadCounts() {
      try {
        const [pedidosRes, snowRes] = await Promise.all([
          fetch('/api/solicitacoes-inventario/count'),
          fetch('/api/snow/count'),
        ])
        const [pedidosJson, snowJson] = await Promise.all([
          pedidosRes.json().catch(() => ({})),
          snowRes.json().catch(() => ({})),
        ])
        if (!cancelled) {
          setPendingPedidosCount(Number(pedidosJson.count ?? 0))
          setPendingSnowCount(Number(snowJson.count ?? 0))
        }
      } catch {
        if (!cancelled) {
          setPendingPedidosCount(0)
          setPendingSnowCount(0)
        }
      }
    }
    loadCounts()
    const interval = window.setInterval(loadCounts, 30000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [session?.user])

  // close mobile drawer on route change
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setMobileOpen(false)
      setPendingHref(null)
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [pathname])

  useEffect(() => {
    if (!pendingHref) return
    const timeout = window.setTimeout(() => setPendingHref(null), 8000)
    return () => window.clearTimeout(timeout)
  }, [pendingHref])

  useEffect(() => {
    if (mobileOpen) {
      document.documentElement.dataset.inventoryMobileMenu = 'open'
    } else {
      delete document.documentElement.dataset.inventoryMobileMenu
    }

    window.dispatchEvent(new CustomEvent('inventory-mobile-menu-toggle', { detail: { open: mobileOpen } }))

    return () => {
      delete document.documentElement.dataset.inventoryMobileMenu
      window.dispatchEvent(new CustomEvent('inventory-mobile-menu-toggle', { detail: { open: false } }))
    }
  }, [mobileOpen])

  useEffect(() => {
    if (previousPathnameRef.current === pathname) return
    previousPathnameRef.current = pathname

    const activeGroup = navGroups.find(group => group.items.some(item => isNavItemActive(pathname, item.href)))?.label
    if (!activeGroup) return

    const timeout = window.setTimeout(() => setOpenGroup(activeGroup), 0)
    return () => window.clearTimeout(timeout)
  }, [pathname])

  function handleSidebarBlankClick(event: ReactMouseEvent<HTMLElement>) {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    if (target.closest('a, button, [data-sidebar-flyout]')) return

    setCollapsed(value => !value)
  }

  function handleNavClick(event: ReactMouseEvent<HTMLAnchorElement>, href: string, active: boolean) {
    if (
      active ||
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return
    }

    setPendingHref(href)
    setMobileOpen(false)
  }

  const initials = session?.user?.name
    ? session.user.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : 'U'

  const renderNavItem = (
    { href, label, icon: Icon }: NavItem,
    options: { collapsed?: boolean; nested?: boolean } = {}
  ) => {
    const active = isNavItemActive(pathname, href)
    const pending = pendingHref === href && !active
    const { collapsed: isCollapsed = false, nested = false } = options

    return (
      <Link
        key={href}
        href={href}
        title={isCollapsed ? label : undefined}
        aria-busy={pending}
        onClick={(event) => handleNavClick(event, href, active)}
        className={cn(
          'flex items-center gap-3 rounded-lg text-sm font-medium transition-all relative',
          nested ? 'py-2 pl-7 pr-3 text-[13px]' : 'px-3 py-2',
          !nested && (active || pending)
            ? 'bg-blue-600 text-white shadow-sm shadow-blue-950/20'
            : 'text-slate-400 hover:text-white hover:bg-slate-700/60',
          nested && active && 'bg-slate-800/80 text-white',
          nested && pending && 'bg-blue-600/80 text-white cursor-wait',
          pending && 'bg-blue-600/80 cursor-wait',
          isCollapsed && 'justify-center px-2'
        )}
      >
        {nested && !isCollapsed && (
          <span className="absolute left-2 top-0 h-full w-px bg-slate-700">
            <span className={cn(
              'absolute left-0 top-1/2 h-px w-3 -translate-y-1/2 bg-slate-700',
              active && 'bg-blue-300'
            )} />
          </span>
        )}
        {pending && <Loader2 className="w-4 h-4 shrink-0 animate-spin" />}
        {!pending && !nested && <Icon className="w-4 h-4 shrink-0" />}
        {!isCollapsed && <span className="truncate">{label}</span>}
        {!isCollapsed && href === '/pedidos' && pendingPedidosCount > 0 && (
          <span className="ml-auto min-w-5 rounded-full bg-blue-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
            {pendingPedidosCount > 99 ? '99+' : pendingPedidosCount}
          </span>
        )}
        {!isCollapsed && href === '/snow' && pendingSnowCount > 0 && (
          <span className="ml-auto min-w-5 rounded-full bg-cyan-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
            {pendingSnowCount > 99 ? '99+' : pendingSnowCount}
          </span>
        )}
        {pending && !isCollapsed && (
          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/80 animate-pulse" />
        )}
      </Link>
    )
  }

  const renderNavGroups = (isCollapsed = false, options: { mobile?: boolean } = {}) => (
    <div className="space-y-1">
      {renderNavItem(primaryNavItem, { collapsed: isCollapsed })}
      {navGroupsFiltrados.map((group, groupIndex) => {
        if (options.mobile && group.mobileHidden) return null
        const items = options.mobile ? group.items.filter(item => !item.mobileHidden) : group.items
        if (items.length === 0) return null

        return (
        <div
          key={group.label}
          className={cn(
            'relative group',
            groupIndex === 0 && 'pt-2 mt-2 border-t border-slate-700/50'
          )}
        >
          {(() => {
            const groupActive = items.some(item => isNavItemActive(pathname, item.href))
            const activeItem = items.find(item => isNavItemActive(pathname, item.href))
            const GroupIcon = activeItem?.icon ?? group.icon
            const groupPending = items.some(item => pendingHref === item.href)
            const expanded = openGroup === group.label
            const groupPedidosCount = group.label === 'Serviços' ? pendingPedidosCount : 0
            const groupSnowCount = group.label === 'Serviços' ? pendingSnowCount : 0

            return (
              <>
                <button
                  type="button"
                  onClick={() => setOpenGroup(expanded ? null : group.label)}
                  aria-label={isCollapsed ? group.label : undefined}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-all relative',
                    groupActive || expanded
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/60',
                    groupPending && 'cursor-wait',
                    isCollapsed && 'justify-center px-2'
                  )}
                >
                  {groupPending
                    ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                    : <GroupIcon className="w-4 h-4 shrink-0" />
                  }
                  {!isCollapsed && (
                    <>
                      <span className="truncate">{group.label}</span>
                      {(groupPedidosCount > 0 || groupSnowCount > 0) && (
                        <span className="ml-auto flex items-center gap-1">
                          {groupPedidosCount > 0 && (
                            <span className="min-w-5 rounded-full bg-blue-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                              {groupPedidosCount > 99 ? '99+' : groupPedidosCount}
                            </span>
                          )}
                          {groupSnowCount > 0 && (
                            <span className="min-w-5 rounded-full bg-cyan-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                              {groupSnowCount > 99 ? '99+' : groupSnowCount}
                            </span>
                          )}
                        </span>
                      )}
                      <ChevronDown
                        className={cn(
                          'w-4 h-4 shrink-0 text-slate-400 transition-transform',
                          expanded && 'rotate-180 text-white'
                        )}
                      />
                    </>
                  )}
                  {groupActive && isCollapsed && (
                    <span className="absolute -left-2 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-blue-500" />
                  )}
                  {isCollapsed && (groupPedidosCount > 0 || groupSnowCount > 0) && (
                    <span
                      className={cn(
                        'absolute right-1 top-1 h-4 min-w-4 rounded-full px-1 text-center text-[9px] font-bold leading-4 text-white',
                        groupPedidosCount > 0 && groupSnowCount > 0
                          ? 'bg-[linear-gradient(90deg,#3b82f6_0_50%,#06b6d4_50%_100%)]'
                          : groupPedidosCount > 0
                            ? 'bg-blue-500'
                            : 'bg-cyan-500'
                      )}
                    >
                      {groupPedidosCount + groupSnowCount > 9 ? '9+' : groupPedidosCount + groupSnowCount}
                    </span>
                  )}
                </button>

                {!isCollapsed && expanded && (
                  <div className="mt-1 space-y-0.5 pl-2">
                    {items.map(item => renderNavItem(item, { nested: true }))}
                  </div>
                )}

                {isCollapsed && (
                  <div
                    data-sidebar-flyout
                    className="absolute left-full top-0 z-50 hidden pl-3 group-hover:block"
                  >
                    <span className="absolute left-0 top-0 h-full w-3" />
                    <div className="w-56 rounded-lg border border-slate-700/70 bg-slate-950 p-2 shadow-2xl shadow-slate-950/40">
                      <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        {group.label}
                      </p>
                      <div className="space-y-0.5">
                        {items.map(item => renderNavItem(item))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )
          })()}
        </div>
        )
      })}
    </div>
  )

  const renderNavContent = () => (
    <>
      {/* Logo header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-slate-700/50 shrink-0">
        <div className={cn('flex items-center gap-2.5 min-w-0', collapsed && 'justify-center w-full')}>
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <Server className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate leading-none">IEC Inventário</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Gestão de TI</p>
            </div>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="hidden lg:flex p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition shrink-0"
            title="Recolher menu"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav items */}
      <nav className={cn('flex-1 py-2 px-2', collapsed ? 'overflow-visible' : 'overflow-y-auto')}>
        {renderNavGroups(collapsed)}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-700/50 p-2 space-y-1 shrink-0">
        {/* User */}
        <div className={cn('flex items-center gap-2 px-2 py-1.5', collapsed && 'justify-center')}>
          <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center text-[10px] font-bold text-blue-200 shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{session?.user?.name || 'Usuário'}</p>
                <p className="text-[10px] text-slate-400 truncate">{session?.user?.email || ''}</p>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                title="Sair"
                className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700 transition shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>

        {/* Expand button when collapsed */}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="flex items-center justify-center w-full p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition"
            title="Expandir menu"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}
      </div>
    </>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <Server className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-white">IEC Inventário</span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          'sidebar lg:hidden fixed top-0 left-0 bottom-0 z-50 w-64 bg-slate-900 flex flex-col transition-transform duration-300',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-3 py-3 border-b border-slate-700/50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <Server className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-white">IEC Inventário</span>
          </div>
          <button onClick={() => setMobileOpen(false)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition">
            <X className="w-4 h-4" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {renderNavGroups(false, { mobile: true })}
        </nav>
        <div className="border-t border-slate-700/50 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center text-[10px] font-bold text-blue-200 shrink-0">{initials}</div>
              <p className="text-xs font-medium text-white truncate">{session?.user?.name || 'Usuário'}</p>
            </div>
            <button onClick={() => signOut({ callbackUrl: '/login' })} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Desktop sidebar */}
      <aside
        onClick={handleSidebarBlankClick}
        className={cn(
          'sidebar hidden lg:flex flex-col h-screen bg-slate-900 text-white transition-all duration-300 shrink-0',
          collapsed ? 'w-14 overflow-visible' : 'w-56'
        )}
      >
        {renderNavContent()}
      </aside>
    </>
  )
}
