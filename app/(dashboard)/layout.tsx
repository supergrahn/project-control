'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { ClaudeNotFound } from '@/components/ClaudeNotFound'
import { useCommandPalette, type Command } from '@/hooks/useCommandPalette'
import { useProjects, useProjectStore } from '@/hooks/useProjects'
import { CommandPalette } from '@/components/CommandPalette'
import { AssistantPanel } from '@/components/AssistantPanel'
import { useAssistantPanel } from '@/hooks/useAssistant'
import { QuickCapture } from '@/components/QuickCapture'
import { PasteModal } from '@/components/PasteModal'
import { ShortcutGuide } from '@/components/ShortcutGuide'
import { FocusProvider } from '@/hooks/useFocus'
import { OrchestratorDrawer } from '@/components/OrchestratorDrawer'
import { SessionWindowProvider, useSessionWindows } from '@/hooks/useSessionWindows'
import { FloatingSessionWindow } from '@/components/FloatingSessionWindow'
import { SessionPillBar } from '@/components/SessionPillBar'
import useSWR from 'swr'
import { useParams } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [claudeAvailable, setClaudeAvailable] = useState<boolean | null>(null)
  const [showQuickCapture, setShowQuickCapture] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showOrchestrator, setShowOrchestrator] = useState(false)
  const router = useRouter()
  const { data: projects = [] } = useProjects()
  const { openProject, selectedProject } = useProjectStore()

  const commands: Command[] = useMemo(() => {
    const projectBase = selectedProject ? `/projects/${selectedProject.id}` : null
    const cmds: Command[] = [
      { id: 'nav-ideas', label: 'Go to Ideas', group: 'Navigate', action: () => { if (projectBase) router.push(`${projectBase}/ideas`) } },
      { id: 'nav-specs', label: 'Go to Specs', group: 'Navigate', action: () => { if (projectBase) router.push(`${projectBase}/specs`) } },
      { id: 'nav-plans', label: 'Go to Plans', group: 'Navigate', action: () => { if (projectBase) router.push(`${projectBase}/plans`) } },
      { id: 'nav-developing', label: 'Go to In Development', group: 'Navigate', action: () => { if (projectBase) router.push(`${projectBase}/developing`) } },
      { id: 'nav-reports', label: 'Go to Reports', group: 'Navigate', action: () => { if (projectBase) router.push(`${projectBase}/reports`) } },
      { id: 'nav-memory', label: 'Go to Memory', group: 'Navigate', action: () => router.push('/memory') },
      { id: 'nav-settings', label: 'Go to Settings', group: 'Navigate', action: () => router.push('/settings') },
    ]
    for (const p of projects) {
      cmds.push({
        id: `project-${p.id}`,
        label: `Switch to: ${p.name}`,
        group: 'Projects',
        keywords: [p.name, p.path],
        action: () => { openProject(p); router.push(`/projects/${p.id}/ideas`) },
      })
    }
    return cmds
  }, [projects, openProject, router, selectedProject])

  const palette = useCommandPalette(commands)
  const assistant = useAssistantPanel()
  const pathname = usePathname()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
        e.preventDefault()
        setShowQuickCapture(prev => !prev)
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'v') {
        e.preventDefault()
        setShowPaste(prev => !prev)
      }
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        setShowShortcuts(prev => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/sessions/health', { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => setClaudeAvailable(data.claudeAvailable))
      .catch((err) => { if (err.name !== 'AbortError') setClaudeAvailable(false) })
    return () => controller.abort()
  }, [])

  return (
    <SessionWindowProvider>
      <FocusProvider>
        <div style={{ display: 'flex', height: '100vh', background: '#0e1012', overflow: 'hidden' }}>
          <SidebarWrapper />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {claudeAvailable === false && (
              <div className="px-4 pt-3">
                <ClaudeNotFound />
              </div>
            )}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              <main style={{ flex: 1, padding: 24, overflowY: 'auto' }}>{children}</main>
              <AssistantPanel isOpen={assistant.isOpen} onClose={assistant.close} currentPage={pathname} />
            </div>
          </div>
        </div>
        {palette.isOpen && (
          <CommandPalette
            commands={palette.filtered}
            query={palette.query}
            onQueryChange={palette.setQuery}
            onClose={palette.close}
          />
        )}
        <QuickCapture isOpen={showQuickCapture} onClose={() => setShowQuickCapture(false)} />
        <PasteModal isOpen={showPaste} onClose={() => setShowPaste(false)} />
        <ShortcutGuide isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
        <OrchestratorDrawer isOpen={showOrchestrator} onClose={() => setShowOrchestrator(false)} />
        <FloatingWindowsRenderer />
        <SessionPillBar />
      </FocusProvider>
    </SessionWindowProvider>
  )
}

function SidebarWrapper() {
  const params = useParams()
  const projectId = params?.projectId as string | undefined
  const { data: project } = useSWR(projectId ? `/api/projects/${projectId}` : null, (url: string) => fetch(url).then(r => r.json()))

  if (!projectId || !project) return null
  return <Sidebar projectId={projectId} projectName={project.name} projectPath={project.path} />
}

function FloatingWindowsRenderer() {
  const { windows, closeWindow, minimizeWindow, bringToFront, updatePosition } = useSessionWindows()
  return (
    <>
      {windows.map((w) => (
        <FloatingSessionWindow
          key={w.session.id}
          state={w}
          onClose={closeWindow}
          onMinimize={minimizeWindow}
          onBringToFront={bringToFront}
          onPositionChange={updatePosition}
        />
      ))}
    </>
  )
}
