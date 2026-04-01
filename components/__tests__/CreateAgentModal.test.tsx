import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { CreateAgentModal } from '@/components/agents/CreateAgentModal'

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('CreateAgentModal', () => {
  beforeEach(() => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/providers') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'p-1', name: 'Claude Code', type: 'claude' }]) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'ag-new', name: 'Tester' }) })
    })
  })

  it('renders name field', async () => {
    render(<CreateAgentModal projectId="proj-1" onCreated={() => {}} onClose={() => {}} />)
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
  })

  it('shows validation error when name is empty', async () => {
    render(<CreateAgentModal projectId="proj-1" onCreated={() => {}} onClose={() => {}} />)
    fireEvent.click(screen.getByText(/create/i))
    expect(screen.getByText(/name is required/i)).toBeInTheDocument()
  })

  it('POSTs to /api/agents and calls onCreated', async () => {
    const onCreated = vi.fn()
    render(<CreateAgentModal projectId="proj-1" onCreated={onCreated} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Tester' } })
    fireEvent.click(screen.getByText(/create/i))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(mockFetch).toHaveBeenCalledWith('/api/agents', expect.objectContaining({ method: 'POST' }))
  })

  it('shows empty state link when no providers', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/providers') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })
    render(<CreateAgentModal projectId="proj-1" onCreated={() => {}} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText(/no providers configured/i)).toBeInTheDocument())
  })
})
