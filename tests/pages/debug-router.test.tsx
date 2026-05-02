/**
 * Server-component render tests for app/debug/router/page.tsx.
 *
 * The page is async (uses `await getDb()` semantics) but vitest can call it
 * directly because it's just a function returning JSX. We render the JSX
 * with @testing-library/react and assert against the resulting DOM.
 *
 * The router insights "graded outcomes" column (Sub-step 8d) is the focus —
 * the per-cell scores table is exercised separately by listScores tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { randomUUID } from 'crypto'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

// notFound throws to halt rendering; our test asserts the gate path explicitly.
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
}))

import { createProject, createSession, getDb } from '@/lib/db'
import { createProvider } from '@/lib/db/providers'
import DebugRouterPage from '@/app/debug/router/page'

const ORIGINAL_ENABLE_DEBUG = process.env.ENABLE_DEBUG_PAGES

beforeEach(() => {
  process.env.ENABLE_DEBUG_PAGES = '1'
  const db = getDb()
  db.prepare('DELETE FROM routing_decisions').run()
  db.prepare('DELETE FROM sessions').run()
  db.prepare('DELETE FROM providers').run()
  db.prepare('DELETE FROM projects').run()
})

afterEach(() => {
  if (ORIGINAL_ENABLE_DEBUG === undefined) delete process.env.ENABLE_DEBUG_PAGES
  else process.env.ENABLE_DEBUG_PAGES = ORIGINAL_ENABLE_DEBUG
})

function seedProviderAndDecision(opts: { provider: string; sessionId: string; grade: 'yes' | 'no' | 'partial' | null }) {
  const db = getDb()
  const projectId = createProject(db, { name: 'P', path: '/tmp/p-' + randomUUID() })
  if (!db.prepare('SELECT id FROM providers WHERE id = ?').get(opts.provider)) {
    createProvider(db, { id: opts.provider, name: opts.provider, type: 'claude', command: 'c', config: null })
  }
  createSession(db, { id: opts.sessionId, projectId, label: 'L', phase: 'develop', sourceFile: null })
  db.prepare(
    `INSERT INTO routing_decisions (id, session_id, task_id, picked_provider, phase, complexity, score_breakdown, created_at)
     VALUES (?, ?, NULL, ?, 'develop', 'normal', '{}', ?)`,
  ).run(randomUUID(), opts.sessionId, opts.provider, new Date().toISOString())
  if (opts.grade) {
    db.prepare('UPDATE sessions SET grade = ?, graded_at = ? WHERE id = ?').run(opts.grade, '2026-05-02T10:00:00.000Z', opts.sessionId)
  }
}

describe('DebugRouterPage graded outcomes column', () => {
  it('renders empty-state when no graded sessions exist', async () => {
    const ui = await DebugRouterPage()
    render(ui)
    expect(screen.getByText(/Graded outcomes per provider/)).toBeInTheDocument()
    expect(screen.getByText(/No graded sessions yet/)).toBeInTheDocument()
  })

  it('renders one row per provider with success%, success, partial, fail counts', async () => {
    seedProviderAndDecision({ provider: 'claude', sessionId: randomUUID(), grade: 'yes' })
    seedProviderAndDecision({ provider: 'claude', sessionId: randomUUID(), grade: 'partial' })
    seedProviderAndDecision({ provider: 'claude', sessionId: randomUUID(), grade: 'no' })
    seedProviderAndDecision({ provider: 'codex',  sessionId: randomUUID(), grade: 'yes' })

    const ui = await DebugRouterPage()
    render(ui)

    const tbl = screen.getByRole('table', { name: /graded outcomes per provider/i })
    // Provider names show up as cell text; pick the row containing 'claude'.
    const claudeCells = tbl.querySelectorAll('tr')
    const rowTexts = Array.from(claudeCells).map((tr) => tr.textContent ?? '')
    expect(rowTexts.some((t) => /claude/.test(t) && /50\.0%/.test(t))).toBe(true)
    expect(rowTexts.some((t) => /codex/.test(t) && /100\.0%/.test(t))).toBe(true)
  })

  it('omits ungraded providers from the table', async () => {
    seedProviderAndDecision({ provider: 'gemini', sessionId: randomUUID(), grade: null })

    const ui = await DebugRouterPage()
    render(ui)
    expect(screen.getByText(/No graded sessions yet/)).toBeInTheDocument()
  })
})
