import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NewProjectModal } from '../projects/NewProjectModal'

// Mock useAddProject (react-query mutation)
const mockMutateAsync = vi.fn()
vi.mock('@/hooks/useProjects', () => ({
  useAddProject: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}))

// Mock router
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

// Mock fetch for validate-path
global.fetch = vi.fn()

describe('NewProjectModal', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the modal with path and name inputs', () => {
    render(<NewProjectModal onClose={onClose} />)
    expect(screen.getByPlaceholderText('/absolute/path/to/repo')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Project name')).toBeInTheDocument()
  })

  it('shows validation error when path is not a git repo', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ valid: false, error: 'Not a git repository' }),
    })
    render(<NewProjectModal onClose={onClose} />)
    const pathInput = screen.getByPlaceholderText('/absolute/path/to/repo')
    fireEvent.change(pathInput, { target: { value: '/tmp' } })
    fireEvent.blur(pathInput)
    await waitFor(() => {
      expect(screen.getByText('Not a git repository')).toBeInTheDocument()
    })
  })

  it('auto-populates name from validated path', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ valid: true, name: 'my-repo' }),
    })
    render(<NewProjectModal onClose={onClose} />)
    const pathInput = screen.getByPlaceholderText('/absolute/path/to/repo')
    fireEvent.change(pathInput, { target: { value: '/home/user/my-repo' } })
    fireEvent.blur(pathInput)
    await waitFor(() => {
      expect((screen.getByPlaceholderText('Project name') as HTMLInputElement).value).toBe('my-repo')
    })
  })

  it('calls onClose when cancel is clicked', () => {
    render(<NewProjectModal onClose={onClose} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
  })
})
