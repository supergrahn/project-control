import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AgentCard } from '@/components/agents/AgentCard'
import type { Agent } from '@/lib/db/agents'

const agent: Agent = {
  id: 'ag-1', project_id: 'p-1', name: 'CEO', title: 'Chief Executive',
  provider_id: 'prov-1', model: null, instructions_path: '.agents/ceo',
  status: 'idle', created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z',
}

describe('AgentCard', () => {
  it('renders name and title', () => {
    render(<AgentCard agent={agent} providerName="Claude Code" onClick={() => {}} />)
    expect(screen.getByText('CEO')).toBeInTheDocument()
    expect(screen.getByText('Chief Executive')).toBeInTheDocument()
  })

  it('renders provider badge', () => {
    render(<AgentCard agent={agent} providerName="Claude Code" onClick={() => {}} />)
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<AgentCard agent={agent} providerName="Claude Code" onClick={onClick} />)
    fireEvent.click(screen.getByText('CEO'))
    expect(onClick).toHaveBeenCalled()
  })

  it('shows idle status dot for idle agent', () => {
    const { container } = render(<AgentCard agent={{ ...agent, status: 'idle' }} providerName={null} onClick={() => {}} />)
    expect(container.querySelector('[data-testid="status-dot"]')).toBeInTheDocument()
  })
})
