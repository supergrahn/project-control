import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useParams: () => ({ projectId: 'p1' }),
}))

const mockSkills = [
  { id: 'sk1', project_id: 'p1', name: 'Coding Standards', key: 'coding-standards', file_path: '.skills/coding-standards.md', created_at: '2026-04-01T00:00:00Z' },
  { id: 'sk2', project_id: 'p1', name: 'Git Workflow', key: 'git-workflow', file_path: '.skills/git-workflow.md', created_at: '2026-04-01T00:00:00Z' },
]

global.fetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes('/api/skills?projectId=')) {
    return Promise.resolve({ ok: true, json: async () => mockSkills })
  }
  if (url.match(/\/api\/skills\/sk\d+$/)) {
    return Promise.resolve({ ok: true, json: async () => ({ ...mockSkills[0], content: '# Coding Standards\n\nUse TypeScript.' }) })
  }
  return Promise.resolve({ ok: true, json: async () => ({}) })
})

import SkillsPage from '@/app/(dashboard)/projects/[projectId]/skills/page'

describe('SkillsPage', () => {
  it('renders skills list after loading', async () => {
    render(<SkillsPage />)
    await waitFor(() => {
      expect(screen.getByText('Coding Standards')).toBeInTheDocument()
      expect(screen.getByText('Git Workflow')).toBeInTheDocument()
    })
  })

  it('shows empty state in right panel when no skill selected', async () => {
    render(<SkillsPage />)
    await waitFor(() => {
      expect(screen.getByText('Select a skill to view or edit it.')).toBeInTheDocument()
    })
  })

  it('filters skills client-side by name', async () => {
    render(<SkillsPage />)
    await waitFor(() => expect(screen.getByText('Coding Standards')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('Filter skills…'), { target: { value: 'git' } })
    expect(screen.queryByText('Coding Standards')).not.toBeInTheDocument()
    expect(screen.getByText('Git Workflow')).toBeInTheDocument()
  })

  it('shows inline create form when + button clicked', async () => {
    render(<SkillsPage />)
    await waitFor(() => expect(screen.getByText('+')).toBeInTheDocument())
    fireEvent.click(screen.getByText('+'))
    expect(screen.getByPlaceholderText('Skill name')).toBeInTheDocument()
  })

  it('auto-generates key from name in create form', async () => {
    render(<SkillsPage />)
    await waitFor(() => expect(screen.getByText('+')).toBeInTheDocument())
    fireEvent.click(screen.getByText('+'))
    fireEvent.change(screen.getByPlaceholderText('Skill name'), { target: { value: 'My New Skill!' } })
    expect(screen.getByDisplayValue('my-new-skill')).toBeInTheDocument()
  })

  it('Escape on create form cancels it', async () => {
    render(<SkillsPage />)
    await waitFor(() => expect(screen.getByText('+')).toBeInTheDocument())
    fireEvent.click(screen.getByText('+'))
    fireEvent.keyDown(screen.getByPlaceholderText('Skill name'), { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Skill name')).not.toBeInTheDocument()
  })
})
