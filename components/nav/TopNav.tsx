'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Settings, Brain, Focus } from 'lucide-react'
import { ProjectTabs } from './ProjectTabs'
import { useFocus } from '@/hooks/useFocus'
import { useProjects } from '@/hooks/useProjects'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/' },
  { label: 'Ideas', href: '/ideas' },
  { label: 'Specs', href: '/specs' },
  { label: 'Plans', href: '/plans' },
  { label: 'Developing', href: '/developing' },
  { label: 'Sessions', href: '/sessions' },
  { label: 'Memory', href: '/memory' },
  { label: 'Context', href: '/context' },
  { label: 'Tech Audit', href: '/tech-audit' },
  { label: 'Search', href: '/search' },
  { label: 'Insights', href: '/insights' },
  { label: 'Git', href: '/git-activity' },
  { label: 'Kanban', href: '/kanban' },
  { label: 'Bookmarks', href: '/bookmarks' },
  { label: 'Timeline', href: '/timeline' },
  { label: 'Templates', href: '/templates' },
  { label: 'Usage', href: '/usage' },
]

type TopNavProps = {
  onAssistantToggle?: () => void
  isAssistantOpen?: boolean
}

export function TopNav({ onAssistantToggle, isAssistantOpen }: TopNavProps = {}) {
  const pathname = usePathname()
  const { focusIds, isFocused, toggleFocus, clearFocus } = useFocus()
  const { data: allProjects = [] } = useProjects()
  const [showFocusMenu, setShowFocusMenu] = useState(false)

  return (
    <header className="border-b border-zinc-800 bg-zinc-950">
      <div className="h-11 flex items-center gap-4 px-4">
        <span className="font-bold text-violet-400 text-sm shrink-0">⬡ Project Control</span>
        <nav className="flex gap-1 ml-2">
          {NAV_ITEMS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                (t.href === '/' ? pathname === '/' : pathname.startsWith(t.href))
                  ? 'bg-violet-500/20 text-violet-300'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <div className="relative">
            <button
              onClick={() => setShowFocusMenu(p => !p)}
              className={`p-1.5 rounded transition-colors ${isFocused ? 'text-amber-400 bg-amber-500/10' : 'text-zinc-500 hover:text-zinc-300'}`}
              title="Focus Mode"
            >
              <Focus size={16} />
            </button>
            {showFocusMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 py-1">
                {allProjects.map(p => (
                  <button key={p.id} onClick={() => toggleFocus(p.id)}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800 flex items-center gap-2">
                    <span className={`w-3 h-3 rounded border ${focusIds.includes(p.id) ? 'bg-amber-500 border-amber-500' : 'border-zinc-600'}`} />
                    <span className="text-zinc-300">{p.name}</span>
                  </button>
                ))}
                {isFocused && (
                  <button onClick={() => { clearFocus(); setShowFocusMenu(false) }}
                    className="w-full text-left px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-800 border-t border-zinc-800 mt-1">
                    Clear focus
                  </button>
                )}
              </div>
            )}
          </div>
          {onAssistantToggle && (
            <button
              onClick={onAssistantToggle}
              className={`p-1.5 rounded transition-colors ${isAssistantOpen ? 'text-violet-400 bg-violet-500/10' : 'text-zinc-500 hover:text-zinc-300'}`}
              title="Toggle Assistant (AI)"
            >
              <Brain size={16} />
            </button>
          )}
          <Link href="/settings" className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300">
            <Settings size={16} />
          </Link>
        </div>
      </div>
      {isFocused && (
        <div className="px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-300">
          Focused on: {allProjects.filter(p => focusIds.includes(p.id)).map(p => p.name).join(', ')}
        </div>
      )}
      <ProjectTabs />
    </header>
  )
}
