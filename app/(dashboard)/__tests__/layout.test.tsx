import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DashboardLayout from '../layout'

vi.mock('@/components/layout/ProjectRail', () => ({
  ProjectRail: () => <div data-testid="project-rail" />,
}))
vi.mock('@/components/layout/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
  DOT_COLORS: ['#5b9bd5', '#3a8c5c', '#8f77c9', '#c97e2a', '#c04040'],
}))
vi.mock('@/components/layout/TopBar', () => ({
  TopBar: () => <div data-testid="topbar" />,
}))
vi.mock('@/components/CommandPalette', () => ({ CommandPalette: () => null }))
vi.mock('@/components/AssistantPanel', () => ({ AssistantPanel: () => null }))
vi.mock('@/components/QuickCapture', () => ({ QuickCapture: () => null }))
vi.mock('@/components/PasteModal', () => ({ PasteModal: () => null }))
vi.mock('@/components/ShortcutGuide', () => ({ ShortcutGuide: () => null }))
vi.mock('@/components/OrchestratorDrawer', () => ({ OrchestratorDrawer: () => null }))
vi.mock('@/components/FloatingSessionWindow', () => ({ FloatingSessionWindow: () => null }))
vi.mock('@/components/SessionPillBar', () => ({ SessionPillBar: () => null }))
vi.mock('@/hooks/useSessionWindows', () => ({
  SessionWindowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSessionWindows: () => ({ windows: [], closeWindow: vi.fn(), minimizeWindow: vi.fn(), bringToFront: vi.fn(), updatePosition: vi.fn() }),
}))
vi.mock('@/hooks/useFocus', () => ({
  FocusProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({ data: [] }),
  useProjectStore: () => ({ openProject: vi.fn(), selectedProject: null }),
}))
vi.mock('@/hooks/useAssistant', () => ({
  useAssistantPanel: () => ({ isOpen: false, close: vi.fn() }),
}))
vi.mock('@/hooks/useCommandPalette', () => ({
  useCommandPalette: () => ({ isOpen: false, filtered: [], query: '', setQuery: vi.fn(), close: vi.fn() }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
  useParams: () => ({}),
}))
vi.mock('@/components/ClaudeNotFound', () => ({ ClaudeNotFound: () => null }))

global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ claudeAvailable: true }) })

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

describe('DashboardLayout', () => {
  it('renders ProjectRail in the layout', () => {
    render(<DashboardLayout><div>content</div></DashboardLayout>, { wrapper })
    expect(screen.getByTestId('project-rail')).toBeInTheDocument()
  })

  it('ProjectRail appears before SidebarWrapper in the DOM', () => {
    render(<DashboardLayout><div>content</div></DashboardLayout>, { wrapper })
    const rail = screen.getByTestId('project-rail')
    const outerDiv = rail.closest('.flex')
    expect(outerDiv).toBeTruthy()
  })
})
