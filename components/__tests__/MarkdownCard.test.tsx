import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownCard } from '../cards/MarkdownCard'
import type { MarkdownFile } from '@/hooks/useFiles'

const baseFile: MarkdownFile = {
  filename: 'my-idea.md',
  path: '/data/ideas/my-idea.md',
  title: 'My Idea',
  excerpt: 'A cool idea',
  modifiedAt: new Date().toISOString(),
  content: '# My Idea',
  sessions: {
    ideate: { sessionId: null, logId: null },
    spec: { sessionId: null, logId: null },
    plan: { sessionId: null, logId: null },
    develop: { sessionId: null, logId: null },
  },
}

describe('MarkdownCard session states', () => {
  it('shows action buttons when no session state provided', () => {
    render(<MarkdownCard file={baseFile} badge="idea" actions={[{ label: '💬 Ideate', onClick: vi.fn() }]} onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: '💬 Ideate' })).toBeInTheDocument()
  })

  it('shows Live badge when session is active (sessionId set, logId null)', () => {
    render(
      <MarkdownCard
        file={baseFile}
        badge="idea"
        actions={[]}
        onClick={vi.fn()}
        phaseSessionState={{ sessionId: 'abc-123', logId: null }}
        onLiveBadgeClick={vi.fn()}
      />
    )
    expect(screen.getByText('▶ Live')).toBeInTheDocument()
  })

  it('shows View log and Resume when session is closed (both set)', () => {
    render(
      <MarkdownCard
        file={baseFile}
        badge="idea"
        actions={[]}
        onClick={vi.fn()}
        phaseSessionState={{ sessionId: 'abc-123', logId: '/logs/my-idea-ideate-log.md' }}
        onViewLog={vi.fn()}
        onResume={vi.fn()}
      />
    )
    expect(screen.getByText('View log')).toBeInTheDocument()
    expect(screen.getByText('Resume')).toBeInTheDocument()
  })
})
