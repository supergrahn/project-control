'use client'
import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { usePathname } from 'next/navigation'

const PROJECT_HEALTH = [
  { label: 'Insights', href: '/insights' },
  { label: 'Git', href: '/git-activity' },
  { label: 'Usage', href: '/usage' },
  { label: 'Compare', href: '/compare' },
  { label: 'Tech Audit', href: '/tech-audit' },
  { label: 'Timeline', href: '/timeline' },
  { label: 'Kanban', href: '/kanban' },
]

const TOOLS = [
  { label: 'Memory', href: '/memory' },
  { label: 'Context', href: '/context' },
  { label: 'Search', href: '/search' },
  { label: 'Bookmarks', href: '/bookmarks' },
  { label: 'Templates', href: '/templates' },
]

type NavDrawerProps = {
  isOpen: boolean
  onClose: () => void
}

export function NavDrawer({ isOpen, onClose }: NavDrawerProps) {
  const pathname = usePathname()

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-64 bg-bg-primary border-l border-border-default z-50 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Menu</span>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-secondary text-text-muted hover:text-text-primary">
            <X size={14} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          <div className="px-3 py-1.5">
            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-1">Project Health</p>
            {PROJECT_HEALTH.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`block px-2 py-1.5 rounded text-sm transition-colors ${
                  (item.href === '/' ? pathname === '/' : pathname.startsWith(item.href))
                    ? 'bg-violet-500/20 text-violet-300'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="px-3 py-1.5 mt-2">
            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-1">Tools</p>
            {TOOLS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`block px-2 py-1.5 rounded text-sm transition-colors ${
                  pathname.startsWith(item.href)
                    ? 'bg-violet-500/20 text-violet-300'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </>
  )
}
