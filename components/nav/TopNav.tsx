'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Settings, Brain, Focus, Bell, Menu, Activity } from 'lucide-react'
import { ProjectTabs } from './ProjectTabs'
import { useFocus } from '@/hooks/useFocus'
import { useProjects, useProjectStore } from '@/hooks/useProjects'
import { useNotifications, useMarkRead } from '@/hooks/useNotifications'
import { useSessionWindows } from '@/hooks/useSessionWindows'
import { useSessions } from '@/hooks/useSessions'

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
  onOrchestratorToggle?: () => void
  isOrchestratorOpen?: boolean
}

export function TopNav({ onAssistantToggle, isAssistantOpen, onDrawerToggle, isDrawerOpen, onOrchestratorToggle, isOrchestratorOpen }: TopNavProps = {}) {
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
  const { data: activeSessions = [] } = useSessions({ status: 'active' })
  const activeCount = activeSessions.length

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
    <header className="border-b border-border-default bg-bg-base">
      <div className="h-11 flex items-center gap-4 px-4">
        <span className="font-bold text-accent-blue text-sm shrink-0">⬡ Project Control</span>
        <nav className="flex gap-1 ml-2">
          {FLOW_ITEMS.map((item) => {
            const href = selectedProject ? `/projects/${selectedProject.id}/${item.slug}` : null
            const isActive = href ? pathname.startsWith(href) : false
            if (!href) {
              return (
                <span key={item.slug} className="px-3 py-1 rounded text-sm text-text-faint cursor-not-allowed">
                  {item.label}
                </span>
              )
            }
            return (
              <Link
                key={item.slug}
                href={href}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  isActive ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-secondary hover:text-text-primary'
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
              className={`p-1.5 rounded transition-colors ${isFocused ? 'text-accent-orange bg-accent-orange/10' : 'text-text-muted hover:text-text-primary'}`}
              title="Focus Mode"
            >
              <Focus size={16} />
            </button>
            {showFocusMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-bg-primary border border-border-strong rounded-lg shadow-xl z-50 py-1">
                {allProjects.map(p => (
                  <button key={p.id} onClick={() => toggleFocus(p.id)}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-bg-secondary flex items-center gap-2">
                    <span className={`w-3 h-3 rounded border ${focusIds.includes(p.id) ? 'bg-accent-orange border-accent-orange' : 'border-text-muted'}`} />
                    <span className="text-text-primary">{p.name}</span>
                  </button>
                ))}
                {isFocused && (
                  <button onClick={() => { clearFocus(); setShowFocusMenu(false) }}
                    className="w-full text-left px-3 py-1.5 text-xs text-text-muted hover:bg-bg-secondary border-t border-border-default mt-1">
                    Clear focus
                  </button>
                )}
              </div>
            )}
          </div>
          {/* Bell */}
          <div ref={notifsRef} className="relative">
            <button onClick={() => setShowNotifs(p => !p)}
              className={`p-1.5 rounded transition-colors relative ${unreadCount > 0 ? 'text-accent-orange' : 'text-text-muted hover:text-text-primary'}`}>
              <Bell size={16} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-accent-red text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {showNotifs && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-bg-primary border border-border-strong rounded-lg shadow-xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border-default">
                  <span className="text-xs font-semibold text-text-primary">Notifications</span>
                  {unreadCount > 0 && (
                    <button onClick={() => { markRead.mutate({ markAll: true }); setShowNotifs(false) }}
                      className="text-[10px] text-text-muted hover:text-text-primary">Mark all read</button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {(notifData?.events ?? []).map(e => (
                    <div key={e.id} className="px-3 py-2 border-b border-border-default/50 hover:bg-bg-secondary/50 cursor-pointer"
                      onClick={() => markRead.mutate({ eventId: e.id })}>
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${e.severity === 'warn' ? 'bg-accent-orange' : e.severity === 'info' ? 'bg-accent-blue' : 'bg-accent-red'}`} />
                        <span className="text-xs text-text-primary flex-1 truncate">{e.summary}</span>
                      </div>
                    </div>
                  ))}
                  {(notifData?.events ?? []).length === 0 && (
                    <p className="text-xs text-text-faint text-center py-4">No unread notifications</p>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* Brain — session windows */}
          <div className="relative">
            <button
              onClick={toggleAll}
              className={`p-1.5 rounded transition-colors ${windows.length > 0 ? 'text-accent-blue bg-accent-blue/10' : 'text-text-muted hover:text-text-primary'}`}
              title="Toggle sessions"
            >
              <Brain size={16} />
            </button>
            {windows.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-accent-blue text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {windows.length > 9 ? '9+' : windows.length}
              </span>
            )}
          </div>
          {/* Orchestrator */}
          {onOrchestratorToggle && (
            <div className="relative">
              <button
                onClick={onOrchestratorToggle}
                className={`p-1.5 rounded transition-colors ${isOrchestratorOpen ? 'text-accent-green bg-accent-green/10' : activeCount > 0 ? 'text-accent-green' : 'text-text-muted hover:text-text-primary'}`}
                title="Orchestrator"
              >
                <Activity size={16} />
              </button>
              {activeCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-accent-green text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">
                  {activeCount > 9 ? '9+' : activeCount}
                </span>
              )}
            </div>
          )}
          {/* Settings */}
          <Link href="/settings" className="p-1.5 rounded hover:bg-bg-secondary text-text-muted hover:text-text-primary">
            <Settings size={16} />
          </Link>
          {/* Drawer toggle */}
          {onDrawerToggle && (
            <button
              onClick={onDrawerToggle}
              className={`p-1.5 rounded transition-colors ${isDrawerOpen ? 'text-accent-blue bg-accent-blue/10' : 'text-text-muted hover:text-text-primary'}`}
              title="More tools"
            >
              <Menu size={16} />
            </button>
          )}
        </div>
      </div>
      {isFocused && (
        <div className="px-4 py-1.5 bg-accent-orange/10 border-b border-accent-orange/20 text-xs text-accent-orange">
          Focused on: {allProjects.filter(p => focusIds.includes(p.id)).map(p => p.name).join(', ')}
        </div>
      )}
      <ProjectTabs />
    </header>
  )
}
