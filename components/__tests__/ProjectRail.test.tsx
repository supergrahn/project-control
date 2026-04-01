import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProjectRail } from '../layout/ProjectRail'

const mockPush = vi.fn()
const mockOpenProject = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ projectId: 'p1' }),
}))

vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({
    data: [
      { id: 'p1', name: 'Alpha', path: '/a', ideas_dir: null, specs_dir: null, plans_dir: null, last_used_at: null },
      { id: 'p2', name: 'Beta',  path: '/b', ideas_dir: null, specs_dir: null, plans_dir: null, last_used_at: null },
    ],
  }),
  useProjectStore: () => ({
    openProject: mockOpenProject,
    activeProjectId: 'p1',
    selectedProject: null,
    openProjects: [],
    closeProject: vi.fn(),
  }),
}))

vi.mock('@/components/projects/NewProjectWizard', () => ({
  NewProjectWizard: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="wizard" onClick={onClose} />
  ),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  )
}

describe('ProjectRail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders one circle button per project with first letter', () => {
    render(<ProjectRail />, { wrapper })
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('active project circle has a visible ring style', () => {
    render(<ProjectRail />, { wrapper })
    const alphaBtn = screen.getByText('A').closest('button')
    expect(alphaBtn).toHaveStyle({ outline: expect.stringContaining('2px solid') })
  })

  it('clicking a project circle calls openProject and navigates', () => {
    render(<ProjectRail />, { wrapper })
    fireEvent.click(screen.getByText('A'))
    expect(mockOpenProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1' })
    )
    expect(mockPush).toHaveBeenCalledWith('/projects/p1')
  })

  it('+ button opens NewProjectWizard', () => {
    render(<ProjectRail />, { wrapper })
    const plusBtn = screen.getByText('+')
    expect(screen.queryByTestId('wizard')).not.toBeInTheDocument()
    fireEvent.click(plusBtn)
    expect(screen.getByTestId('wizard')).toBeInTheDocument()
  })

  it('closing wizard hides it', () => {
    render(<ProjectRail />, { wrapper })
    fireEvent.click(screen.getByText('+'))
    fireEvent.click(screen.getByTestId('wizard'))
    expect(screen.queryByTestId('wizard')).not.toBeInTheDocument()
  })
})
