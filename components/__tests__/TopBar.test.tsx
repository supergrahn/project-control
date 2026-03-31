// components/__tests__/TopBar.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockMutateAsync = vi.fn().mockResolvedValue({})
let mockIsPending = false

vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({
    data: [
      {
        id: 'p1',
        name: 'project-control',
        path: '/home/user/project-control',
        ideas_dir: 'docs/ideas',
        specs_dir: 'docs/specs',
        plans_dir: 'docs/plans',
        last_used_at: null,
      },
    ],
    isLoading: false,
  }),
  useUpdateSettings: () => ({
    mutateAsync: mockMutateAsync,
    isPending: mockIsPending,
  }),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/projects/p1/ideas',
  useRouter: () => ({ push: vi.fn() }),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient()
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('TopBar', () => {
  beforeEach(async () => {
    mockMutateAsync.mockClear()
    mockIsPending = false
    const { TopBar } = await import('../layout/TopBar')
    // re-export for use in tests
    ;(globalThis as any).__TopBar = TopBar
  })

  it('renders project name in breadcrumb', async () => {
    const { TopBar } = await import('../layout/TopBar')
    render(<TopBar projectId="p1" projectName="project-control" />, { wrapper })
    expect(screen.getByText('project-control')).toBeInTheDocument()
  })

  it('renders "Ideas" label when pathname ends in /ideas', async () => {
    const { TopBar } = await import('../layout/TopBar')
    render(<TopBar projectId="p1" projectName="project-control" />, { wrapper })
    expect(screen.getByText('Ideas')).toBeInTheDocument()
  })

  it('renders "Dashboard" label is not shown for /ideas path', async () => {
    const { TopBar } = await import('../layout/TopBar')
    render(<TopBar projectId="p1" projectName="project-control" />, { wrapper })
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  it('renders gear button', async () => {
    const { TopBar } = await import('../layout/TopBar')
    render(<TopBar projectId="p1" projectName="project-control" />, { wrapper })
    expect(screen.getByLabelText('Open project settings')).toBeInTheDocument()
  })

  it('clicking gear opens settings drawer', async () => {
    const { TopBar } = await import('../layout/TopBar')
    render(<TopBar projectId="p1" projectName="project-control" />, { wrapper })
    expect(screen.queryByText('Project Settings')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Open project settings'))
    expect(screen.getByText('Project Settings')).toBeInTheDocument()
  })

  it('renders directory fields pre-populated from project data', async () => {
    const { TopBar } = await import('../layout/TopBar')
    render(<TopBar projectId="p1" projectName="project-control" />, { wrapper })
    fireEvent.click(screen.getByLabelText('Open project settings'))
    expect(screen.getByDisplayValue('docs/ideas')).toBeInTheDocument()
    expect(screen.getByDisplayValue('docs/specs')).toBeInTheDocument()
    expect(screen.getByDisplayValue('docs/plans')).toBeInTheDocument()
  })

  it('clicking overlay closes drawer', async () => {
    const { TopBar } = await import('../layout/TopBar')
    render(<TopBar projectId="p1" projectName="project-control" />, { wrapper })
    fireEvent.click(screen.getByLabelText('Open project settings'))
    expect(screen.getByText('Project Settings')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('drawer-overlay'))
    expect(screen.queryByText('Project Settings')).not.toBeInTheDocument()
  })

  it('save button calls useUpdateSettings with correct payload', async () => {
    const { TopBar } = await import('../layout/TopBar')
    render(<TopBar projectId="p1" projectName="project-control" />, { wrapper })
    fireEvent.click(screen.getByLabelText('Open project settings'))
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: 'p1',
        settings: { ideas_dir: 'docs/ideas', specs_dir: 'docs/specs', plans_dir: 'docs/plans' },
      })
    })
  })

  it('converts empty string to null before saving', async () => {
    const { TopBar } = await import('../layout/TopBar')
    render(<TopBar projectId="p1" projectName="project-control" />, { wrapper })
    fireEvent.click(screen.getByLabelText('Open project settings'))
    fireEvent.change(screen.getByDisplayValue('docs/ideas'), { target: { value: '' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: 'p1',
        settings: { ideas_dir: null, specs_dir: 'docs/specs', plans_dir: 'docs/plans' },
      })
    })
  })

  it('shows "Saving…" while mutation is pending', async () => {
    mockIsPending = true
    const { TopBar } = await import('../layout/TopBar')
    render(<TopBar projectId="p1" projectName="project-control" />, { wrapper })
    fireEvent.click(screen.getByLabelText('Open project settings'))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  })
})
