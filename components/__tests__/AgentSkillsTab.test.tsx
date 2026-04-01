import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const mockSkills = [
  { id: 'sk1', project_id: 'p1', name: 'Coding Standards', key: 'coding-standards', file_path: '.skills/coding-standards.md', created_at: '2026-04-01T00:00:00Z' },
]

global.fetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes('/api/skills?projectId=')) {
    return Promise.resolve({ ok: true, json: async () => mockSkills })
  }
  if (url.includes('/api/skills/sk1')) {
    return Promise.resolve({ ok: true, json: async () => ({ ...mockSkills[0], content: '# Coding Standards\n\nUse TypeScript strictly.' }) })
  }
  return Promise.resolve({ ok: true, json: async () => ({}) })
})

import { SkillsTab } from '@/components/agents/SkillsTab'

describe('SkillsTab', () => {
  it('renders skill cards with name and key', async () => {
    render(<SkillsTab projectId="p1" />)
    await waitFor(() => {
      expect(screen.getByText('Coding Standards')).toBeInTheDocument()
      expect(screen.getByText('coding-standards')).toBeInTheDocument()
    })
  })

  it('shows first-line preview of non-heading content', async () => {
    render(<SkillsTab projectId="p1" />)
    await waitFor(() => {
      expect(screen.getByText(/Use TypeScript strictly/)).toBeInTheDocument()
    })
  })

  it('shows injection note', async () => {
    render(<SkillsTab projectId="p1" />)
    await waitFor(() => {
      expect(screen.getByText(/automatically injected/i)).toBeInTheDocument()
    })
  })

  it('shows empty state when no skills', async () => {
    vi.mocked(global.fetch).mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: async () => [] })
    )
    render(<SkillsTab projectId="p1" />)
    await waitFor(() => {
      expect(screen.getByText(/No skills configured yet/i)).toBeInTheDocument()
    })
  })
})
