import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NewProjectWizard } from '../projects/NewProjectWizard'

const mockMutateAsync = vi.fn()
const mockPush = vi.fn()

vi.mock('@/hooks/useProjects', () => ({
  useAddProject: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

global.fetch = vi.fn()

const validPathResponse = { ok: true, json: async () => ({ valid: true, name: 'my-repo' }) }
const invalidPathResponse = { ok: true, json: async () => ({ valid: false, error: 'Not a git repository' }) }
const emptyProvidersResponse = { ok: true, json: async () => [] }
const providersResponse = { ok: true, json: async () => [{ id: 'pv1', name: 'Anthropic', is_active: 1 }] }

describe('NewProjectWizard', () => {
  const onClose = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('renders step indicator with Project highlighted on mount', () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(emptyProvidersResponse)
    render(<NewProjectWizard onClose={onClose} />)
    expect(screen.getByText('Project')).toBeInTheDocument()
    expect(screen.getByText('Agent')).toBeInTheDocument()
    expect(screen.getByText('Task')).toBeInTheDocument()
    expect(screen.getByText('Launch')).toBeInTheDocument()
  })

  it('Next button is disabled until path validates', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(invalidPathResponse)
    render(<NewProjectWizard onClose={onClose} />)
    const nextBtn = screen.getByText('Next')
    expect(nextBtn).toBeDisabled()
    const pathInput = screen.getByPlaceholderText('/absolute/path/to/repo')
    fireEvent.change(pathInput, { target: { value: '/tmp' } })
    fireEvent.blur(pathInput)
    await waitFor(() => expect(screen.getByText('Not a git repository')).toBeInTheDocument())
    expect(nextBtn).toBeDisabled()
  })

  it('auto-populates name from valid path and enables Next', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(validPathResponse)
    render(<NewProjectWizard onClose={onClose} />)
    const pathInput = screen.getByPlaceholderText('/absolute/path/to/repo')
    fireEvent.change(pathInput, { target: { value: '/home/user/my-repo' } })
    fireEvent.blur(pathInput)
    await waitFor(() =>
      expect((screen.getByPlaceholderText('Project name') as HTMLInputElement).value).toBe('my-repo')
    )
    expect(screen.getByText('Next')).not.toBeDisabled()
  })

  it('Set up later skips agent and advances to Step 4 (Launch)', async () => {
    ;(fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(validPathResponse)
      .mockResolvedValueOnce(providersResponse)
    render(<NewProjectWizard onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('/absolute/path/to/repo'), { target: { value: '/home/user/my-repo' } })
    fireEvent.blur(screen.getByPlaceholderText('/absolute/path/to/repo'))
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled())
    fireEvent.click(screen.getByText('Next'))
    await waitFor(() => expect(screen.getByText('Set up later')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Set up later'))
    await waitFor(() => expect(screen.getByText('Create & Open')).toBeInTheDocument())
  })

  it('shows No providers configured when GET /api/providers returns empty', async () => {
    ;(fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(validPathResponse)
      .mockResolvedValueOnce(emptyProvidersResponse)
    render(<NewProjectWizard onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('/absolute/path/to/repo'), { target: { value: '/home/user/my-repo' } })
    fireEvent.blur(screen.getByPlaceholderText('/absolute/path/to/repo'))
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled())
    fireEvent.click(screen.getByText('Next'))
    await waitFor(() => expect(screen.getByText(/No providers configured/)).toBeInTheDocument())
  })

  it('shows Task step when agent is configured', async () => {
    ;(fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(validPathResponse)
      .mockResolvedValueOnce(providersResponse)
    render(<NewProjectWizard onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('/absolute/path/to/repo'), { target: { value: '/home/user/my-repo' } })
    fireEvent.blur(screen.getByPlaceholderText('/absolute/path/to/repo'))
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled())
    fireEvent.click(screen.getByText('Next'))
    await waitFor(() => expect(screen.getByPlaceholderText('Agent name')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('Agent name'), { target: { value: 'Dev' } })
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByPlaceholderText('Task title')).toBeInTheDocument()
  })

  it('Add tasks later skips task creation', async () => {
    ;(fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(validPathResponse)
      .mockResolvedValueOnce(providersResponse)
    render(<NewProjectWizard onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('/absolute/path/to/repo'), { target: { value: '/home/user/my-repo' } })
    fireEvent.blur(screen.getByPlaceholderText('/absolute/path/to/repo'))
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled())
    fireEvent.click(screen.getByText('Next'))
    await waitFor(() => expect(screen.getByPlaceholderText('Agent name')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('Agent name'), { target: { value: 'Dev' } })
    fireEvent.click(screen.getByText('Next'))
    await waitFor(() => expect(screen.getByText('Add tasks later')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Add tasks later'))
    expect(screen.getByText('Create & Open')).toBeInTheDocument()
  })

  it('Create & Open calls addProject.mutateAsync and navigates', async () => {
    mockMutateAsync.mockResolvedValue({ id: 'new-proj' })
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(validPathResponse)
    render(<NewProjectWizard onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('/absolute/path/to/repo'), { target: { value: '/home/user/my-repo' } })
    fireEvent.blur(screen.getByPlaceholderText('/absolute/path/to/repo'))
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled())
    fireEvent.click(screen.getByText('Next'))
    await waitFor(() => expect(screen.getByText('Set up later')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Set up later'))
    await waitFor(() => expect(screen.getByText('Create & Open')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Create & Open'))
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ name: 'my-repo', path: '/home/user/my-repo' })
      expect(mockPush).toHaveBeenCalledWith('/projects/new-proj')
    })
  })

  it('Start now button only visible when both agent and task are configured', async () => {
    mockMutateAsync.mockResolvedValue({ id: 'new-proj' })
    ;(fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(validPathResponse)
      .mockResolvedValueOnce(providersResponse)
      .mockResolvedValue({ ok: true, json: async () => ({ id: 'task-1' }) })
    render(<NewProjectWizard onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('/absolute/path/to/repo'), { target: { value: '/home/user/my-repo' } })
    fireEvent.blur(screen.getByPlaceholderText('/absolute/path/to/repo'))
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled())
    fireEvent.click(screen.getByText('Next'))
    await waitFor(() => expect(screen.getByPlaceholderText('Agent name')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('Agent name'), { target: { value: 'Dev' } })
    fireEvent.click(screen.getByText('Next'))
    await waitFor(() => expect(screen.getByPlaceholderText('Task title')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'Fix the bug' } })
    fireEvent.click(screen.getByText('Next'))
    await waitFor(() => expect(screen.getByText('Start now')).toBeInTheDocument())
    expect(screen.getByText('Create & Open')).toBeInTheDocument()
  })

  it('Start now button absent when agent was skipped', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(validPathResponse)
    render(<NewProjectWizard onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('/absolute/path/to/repo'), { target: { value: '/home/user/my-repo' } })
    fireEvent.blur(screen.getByPlaceholderText('/absolute/path/to/repo'))
    await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled())
    fireEvent.click(screen.getByText('Next'))
    await waitFor(() => expect(screen.getByText('Set up later')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Set up later'))
    await waitFor(() => expect(screen.getByText('Create & Open')).toBeInTheDocument())
    expect(screen.queryByText('Start now')).not.toBeInTheDocument()
  })
})
