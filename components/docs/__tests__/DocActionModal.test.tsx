import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DocActionModal } from '../DocActionModal'

afterEach(() => {
  vi.restoreAllMocks()
})

function renderModal(overrides: Partial<React.ComponentProps<typeof DocActionModal>> = {}) {
  const props: React.ComponentProps<typeof DocActionModal> = {
    open: true,
    projectId: 'proj-1',
    phase: 'brainstorm',
    sourceFile: 'ideas/foo.md',
    sourceName: 'foo.md',
    onClose: vi.fn(),
    onStarted: vi.fn(),
    ...overrides,
  }
  const utils = render(<DocActionModal {...props} />)
  return { ...utils, props }
}

describe('DocActionModal', () => {
  it('renders title and source path when open', () => {
    renderModal()
    expect(screen.getByText('Brainstorm from "foo.md"')).toBeInTheDocument()
    expect(screen.getByText('ideas/foo.md')).toBeInTheDocument()
  })

  it('renders nothing when closed', () => {
    const { container } = renderModal({ open: false })
    expect(container.firstChild).toBeNull()
  })

  it('pre-fills textarea with brainstorm starter', () => {
    renderModal({ phase: 'brainstorm', sourceFile: 'ideas/foo.md' })
    const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement
    expect(textarea.value).toBe('Brainstorm this idea further. The source material is attached as ideas/foo.md.')
  })

  it('pre-fills textarea with spec starter', () => {
    renderModal({ phase: 'spec', sourceFile: 'ideas/foo.md' })
    const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement
    expect(textarea.value).toBe('Write a spec based on this. The source material is attached as ideas/foo.md.')
  })

  it('pre-fills textarea with plan starter', () => {
    renderModal({ phase: 'plan', sourceFile: 'specs/bar.md' })
    const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement
    expect(textarea.value).toBe('Write an implementation plan from this spec. The source material is attached as specs/bar.md.')
  })

  it('pre-fills textarea with develop starter', () => {
    renderModal({ phase: 'develop', sourceFile: 'plans/baz.md' })
    const textarea = screen.getByLabelText('Prompt') as HTMLTextAreaElement
    expect(textarea.value).toBe('Implement this plan. The source material is attached as plans/baz.md.')
  })

  it('calls fetch with the expected body on Start', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ sessionId: 'sess-1' }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const { props } = renderModal({ phase: 'spec', sourceFile: 'ideas/foo.md', sourceName: 'foo.md' })

    fireEvent.click(screen.getByRole('button', { name: 'Start session' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/sessions')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual({
      projectId: 'proj-1',
      phase: 'spec',
      sourceFile: 'ideas/foo.md',
      userContext: 'Write a spec based on this. The source material is attached as ideas/foo.md.',
      permissionMode: 'default',
    })

    await waitFor(() => expect(props.onStarted).toHaveBeenCalled())
    expect(props.onClose).toHaveBeenCalled()
  })

  it('shows error inline on non-2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'sourceFile not found' }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const { props } = renderModal()

    fireEvent.click(screen.getByRole('button', { name: 'Start session' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('sourceFile not found')
    })
    expect(props.onStarted).not.toHaveBeenCalled()
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('calls onStarted then onClose on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ sessionId: 'sess-1' }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const order: string[] = []
    const onStarted = vi.fn(() => { order.push('started') })
    const onClose = vi.fn(() => { order.push('closed') })

    renderModal({ onStarted, onClose })

    fireEvent.click(screen.getByRole('button', { name: 'Start session' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onStarted).toHaveBeenCalled()
    expect(order).toEqual(['started', 'closed'])
  })
})
