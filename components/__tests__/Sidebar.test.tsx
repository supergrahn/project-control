// components/__tests__/Sidebar.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { Sidebar } from '../layout/Sidebar'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SWRConfig } from 'swr'
import { SessionWindowProvider } from '@/hooks/useSessionWindows'

// Mock hooks
vi.mock('@/hooks/useTasks', () => ({
  useTasks: () => ({ tasks: [], error: null, isLoading: false }),
}))
vi.mock('@/components/projects/NewProjectWizard', () => ({ NewProjectWizard: () => null }))
vi.mock('@/hooks/useSessions', () => ({
  useSessions: () => ({ data: [], isLoading: false }),
}))
vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({ data: [
    { id: 'p1', name: 'project-control', path: '/home/user/project-control', ideas_dir: null, specs_dir: null, plans_dir: null, last_used_at: null },
    { id: 'p2', name: 'other-repo', path: '/home/user/other-repo', ideas_dir: null, specs_dir: null, plans_dir: null, last_used_at: null },
  ], isLoading: false }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/projects/p1',
  useRouter: () => ({ push: vi.fn() }),
}))
global.fetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes('/api/me')) return Promise.resolve({ ok: true, json: async () => ({ name: 'Test User', initials: 'TU' }) })
  if (url.includes('/api/agents')) return Promise.resolve({ ok: true, json: async () => [{ id: 'a1', name: 'CEO', status: 'idle' }] })
  if (url.includes('/api/skills')) return Promise.resolve({ ok: true, json: async () => [{ id: 's1', name: 'Planning', key: 'planning' }] })
  if (url.includes('/api/projects')) return Promise.resolve({ ok: true, json: async () => ({}) })
  return Promise.resolve({ ok: true, json: async () => ({}) })
})

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient()
  return (
    <QueryClientProvider client={qc}>
      <SWRConfig value={{ provider: () => new Map() }}>
        <SessionWindowProvider>{children}</SessionWindowProvider>
      </SWRConfig>
    </QueryClientProvider>
  )
}

describe('Sidebar', () => {
  it('renders Dashboard nav item', () => {
    render(<Sidebar projectId="p1" projectName="project-control" projectPath="/home/user/project-control" />, { wrapper })
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('renders Pipeline section with phase labels (no emoji)', () => {
    render(<Sidebar projectId="p1" projectName="project-control" projectPath="/home/user/project-control" />, { wrapper })
    expect(screen.getByText('Ideas')).toBeInTheDocument()
    expect(screen.getByText('Specs')).toBeInTheDocument()
    // No emoji characters in nav items
    const pipeline = screen.getByText('Pipeline')
    expect(pipeline.closest('div')?.textContent).not.toMatch(/[💡📐📋⚙️]/)
  })

  it('renders Add Project button', () => {
    render(<Sidebar projectId="p1" projectName="project-control" projectPath="/home/user/project-control" />, { wrapper })
    expect(screen.getByText('+ Add Project')).toBeInTheDocument()
  })

  it('renders user avatar with initials from /api/me', async () => {
    render(<Sidebar projectId="p1" projectName="project-control" projectPath="/home/user/project-control" />, { wrapper })
    await waitFor(() => {
      expect(screen.getByText('TU')).toBeInTheDocument()
    })
  })

  it('renders Agents section with individual agents listed', async () => {
    render(<Sidebar projectId="p1" projectName="project-control" projectPath="/home/user/project-control" />, { wrapper })
    await waitFor(() => {
      expect(screen.getByText('CEO')).toBeInTheDocument()
    })
  })

  it('renders Skills section header with + link', () => {
    render(<Sidebar projectId="p1" projectName="project-control" projectPath="/home/user/project-control" />, { wrapper })
    expect(screen.getByText('Skills')).toBeInTheDocument()
  })
})
