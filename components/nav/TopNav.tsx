'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Settings, Brain, Focus, Bell, Menu } from 'lucide-react'
import { ProjectTabs } from './ProjectTabs'
import { useFocus } from '@/hooks/useFocus'
import { useProjects, useProjectStore } from '@/hooks/useProjects'
import { useNotifications, useMarkRead } from '@/hooks/useNotifications'
import { useSessionWindows } from '@/hooks/useSessionWindows'

const FLOW_ITEMS = [
  { label: 'Ideas', slug: 'ideas' },
  { label: 'Specs', slug: 'specs' },
  { label: 'Plans', slug: 'plans' },
  { label: 'In Development', slug: 'developing' },
  { label: 'Reports', slug: 'reports' },
]

type TopNavProps = {
  onAssistantToggle?: () => void
  isAssistantOpen?: boolean
  onDrawerToggle?: () => void
  isDrawerOpen?: boolean
}

export function TopNav({ onAssistantToggle, isAssistantOpen, onDrawerToggle, isDrawerOpen }: TopNavProps = {}) {
  const pathname = usePathname()
  const { focusIds, isFocused, toggleFocus, clearFocus } = useFocus()
  const { data: allProjects = [] } = useProjects()
  const { selectedProject } = useProjectStore()
  const [showFocusMenu, setShowFocusMenu] = useState(false)
  const { data: notifData } = useNotifications()
  const markRead = useMarkRead()
  const [showNotifs, setShowNotifs] = useState(false)
  const notifsRef = useRef<HTMLDivElement>(null)
  const unreadCount = notifData?.unreadCount ?? 0
  const { windows, toggleAll } = useSessionWindows()

  useEffect(() => {
    if (!showNotifs) return
    const handler = (e: MouseEvent) => {
      if (notifsRef.current && !notifsRef.current.contains(e.target as Node)) {
        setShowNotifs(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showNotifs])

  return (
    <header className="border-b border-zinc-800 bg-zinc-950">
      <div className="h-11 flex items-center gap-4 px-4">
        <span className="font-bold text-violet-400 text-sm shrink-0">⬡ Project Control</span>
        <nav className="flex gap-1 ml-2">
          {FLOW_ITEMS.map((item) => {
            const href = selectedProject ? `/projects/${selectedProject.id}/${item.slug}` : null
            const isActive = href ? pathname.startsWith(href) : false
            if (!href) {
              return (
                <span key={item.slug} className="px-3 py-1 rounded text-sm text-zinc-600 cursor-not-allowed">
                  {item.label}
                </span>
              )
            }
            return (
              <Link
                key={item.slug}
                href={href}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  isActive ? 'bg-violet-500/20 text-violet-300' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          {/* Focus */}
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
          {/* Bell */}
          <div ref={notifsRef} className="relative">
            <button onClick={() => setShowNotifs(p => !p)}
              className={`p-1.5 rounded transition-colors relative ${unreadCount > 0 ? 'text-amber-400' : 'text-zinc-500 hover:text-zinc-300'}`}>
              <Bell size={16} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {showNotifs && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
                  <span className="text-xs font-semibold text-zinc-200">Notifications</span>
                  {unreadCount > 0 && (
                    <button onClick={() => { markRead.mutate({ markAll: true }); setShowNotifs(false) }}
                      className="text-[10px] text-zinc-500 hover:text-zinc-300">Mark all read</button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {(notifData?.events ?? []).map(e => (
                    <div key={e.id} className="px-3 py-2 border-b border-zinc-800/50 hover:bg-zinc-800/50 cursor-pointer"
                      onClick={() => markRead.mutate({ eventId: e.id })}>
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${e.severity === 'warn' ? 'bg-amber-500' : e.severity === 'info' ? 'bg-blue-400' : 'bg-red-500'}`} />
                        <span className="text-xs text-zinc-300 flex-1 truncate">{e.summary}</span>
                      </div>
                    </div>
                  ))}
                  {(notifData?.events ?? []).length === 0 && (
                    <p className="text-xs text-zinc-600 text-center py-4">No unread notifications</p>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* Brain — session windows */}
          <div className="relative">
            <button
              onClick={toggleAll}
              className={`p-1.5 rounded transition-colors ${windows.length > 0 ? 'text-violet-400 bg-violet-500/10' : 'text-zinc-500 hover:text-zinc-300'}`}
              title="Toggle sessions"
            >
              <Brain size={16} />
            </button>
            {windows.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-violet-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {windows.length > 9 ? '9+' : windows.length}
              </span>
            )}
          </div>
          {/* Settings */}
          <Link href="/settings" className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300">
            <Settings size={16} />
          </Link>
          {/* Drawer toggle */}
          {onDrawerToggle && (
            <button
              onClick={onDrawerToggle}
              className={`p-1.5 rounded transition-colors ${isDrawerOpen ? 'text-violet-400 bg-violet-500/10' : 'text-zinc-500 hover:text-zinc-300'}`}
              title="More tools"
            >
              <Menu size={16} />
            </button>
          )}
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
