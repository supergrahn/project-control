'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { TopNav } from '@/components/nav/TopNav'
import { ClaudeNotFound } from '@/components/ClaudeNotFound'
import { useCommandPalette, type Command } from '@/hooks/useCommandPalette'
import { useProjects, useProjectStore } from '@/hooks/useProjects'
import { CommandPalette } from '@/components/CommandPalette'
import { AssistantPanel } from '@/components/AssistantPanel'
import { useAssistantPanel } from '@/hooks/useAssistant'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [claudeAvailable, setClaudeAvailable] = useState<boolean | null>(null)
  const router = useRouter()
  const { data: projects = [] } = useProjects()
  const { openProject } = useProjectStore()

  const commands: Command[] = useMemo(() => {
    const cmds: Command[] = [
      { id: 'nav-dashboard', label: 'Go to Dashboard', group: 'Navigate', action: () => router.push('/') },
      { id: 'nav-ideas', label: 'Go to Ideas', group: 'Navigate', action: () => router.push('/ideas') },
      { id: 'nav-specs', label: 'Go to Specs', group: 'Navigate', action: () => router.push('/specs') },
      { id: 'nav-plans', label: 'Go to Plans', group: 'Navigate', action: () => router.push('/plans') },
      { id: 'nav-developing', label: 'Go to Developing', group: 'Navigate', action: () => router.push('/developing') },
      { id: 'nav-memory', label: 'Go to Memory', group: 'Navigate', action: () => router.push('/memory') },
      { id: 'nav-settings', label: 'Go to Settings', group: 'Navigate', action: () => router.push('/settings') },
    ]
    for (const p of projects) {
      cmds.push({
        id: `project-${p.id}`,
        label: `Switch to: ${p.name}`,
        group: 'Projects',
        keywords: [p.name, p.path],
        action: () => { openProject(p); router.push('/') },
      })
    }
    return cmds
  }, [projects, openProject, router])

  const palette = useCommandPalette(commands)
  const assistant = useAssistantPanel()
  const pathname = usePathname()

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/sessions/health', { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => setClaudeAvailable(data.claudeAvailable))
      .catch((err) => { if (err.name !== 'AbortError') setClaudeAvailable(false) })
    return () => controller.abort()
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <TopNav onAssistantToggle={assistant.toggle} isAssistantOpen={assistant.isOpen} />
      {claudeAvailable === false && (
        <div className="px-4 pt-3">
          <ClaudeNotFound />
        </div>
      )}
      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
        <AssistantPanel isOpen={assistant.isOpen} onClose={assistant.close} currentPage={pathname} />
      </div>
      {palette.isOpen && (
        <CommandPalette
          commands={palette.filtered}
          query={palette.query}
          onQueryChange={palette.setQuery}
          onClose={palette.close}
        />
      )}
    </div>
  )
}
