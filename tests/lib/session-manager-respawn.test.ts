import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

import { getDb, createProject, createSession } from '@/lib/db'
import { createProvider } from '@/lib/db/providers'
import { spawnSession, respawnSessionWithProvider } from '@/lib/session-manager'

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM routing_decisions').run()
  db.prepare('DELETE FROM routing_outcomes').run()
  db.prepare('DELETE FROM routing_scores').run()
  db.prepare('DELETE FROM sessions').run()
  db.prepare('DELETE FROM providers').run()
  db.prepare('DELETE FROM projects').run()
})

describe('spawnSession on adapter throw', () => {
  it('sets session status to needs_route_retry and records exit_reason', async () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: `/tmp/p-${randomUUID()}` })
    createProvider(db, {
      id: 'broken',
      name: 'broken',
      type: 'claude',
      command: '/nonexistent-binary-that-cannot-exist-xyz',
      config: null,
    })

    let sessionId: string | undefined
    try {
      sessionId = await spawnSession({
        projectId,
        projectPath: '/tmp',
        label: 'L',
        phase: 'develop',
        sourceFile: null,
        userContext: '',
        permissionMode: 'default',
      })
    } catch {
      // expected — adapter spawn fails because the binary doesn't exist
    }

    // Even though spawnSession threw, the session row should exist with needs_route_retry.
    const row = db.prepare(`SELECT id, status, exit_reason FROM sessions WHERE project_id = ?`).get(projectId) as
      | { id: string; status: string; exit_reason: string | null }
      | undefined
    expect(row).toBeTruthy()
    expect(row?.status).toBe('needs_route_retry')
    expect(row?.exit_reason).toMatch(/^adapter_spawn_failed: /)
    // Sanity: if spawnSession returned an id, it should match the row.
    if (sessionId) expect(row?.id).toBe(sessionId)
  })
})

describe('respawnSessionWithProvider', () => {
  it('flips a stuck session to needs_route_retry again when the new provider also fails', async () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: `/tmp/p-${randomUUID()}` })
    createProvider(db, {
      id: 'still-broken',
      name: 'still-broken',
      type: 'claude',
      command: '/another-nonexistent-binary-xyz',
      config: null,
    })

    // Seed a session that is currently in needs_route_retry awaiting a manual retry.
    const sessionId = randomUUID()
    createSession(db, { id: sessionId, projectId, label: 'L', phase: 'develop', sourceFile: null })
    db.prepare(`UPDATE sessions SET status = 'needs_route_retry' WHERE id = ?`).run(sessionId)

    let threw = false
    try {
      await respawnSessionWithProvider(sessionId, 'still-broken')
    } catch {
      threw = true
    }

    // The respawn should propagate the spawn failure...
    expect(threw).toBe(true)
    // ...and re-flip the session to needs_route_retry so the user can keep retrying.
    const row = db.prepare(`SELECT status, exit_reason FROM sessions WHERE id = ?`).get(sessionId) as
      | { status: string; exit_reason: string | null }
      | undefined
    expect(row?.status).toBe('needs_route_retry')
    expect(row?.exit_reason).toMatch(/^adapter_spawn_failed: /)
  })

  it('returns 404-equivalent (throws) for unknown session and provider', async () => {
    await expect(respawnSessionWithProvider('nope', 'nope')).rejects.toThrow(/session not found/)

    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: `/tmp/p-${randomUUID()}` })
    const sessionId = randomUUID()
    createSession(db, { id: sessionId, projectId, label: 'L', phase: 'develop', sourceFile: null })
    await expect(respawnSessionWithProvider(sessionId, 'nope')).rejects.toThrow(/provider not found/)
  })

  it('persists userContext / permissionMode / correctionNote so respawn reuses them', async () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: `/tmp/p-${randomUUID()}` })
    createProvider(db, {
      id: 'broken',
      name: 'broken',
      type: 'claude',
      command: '/nonexistent-binary-xyz',
      config: null,
    })

    try {
      await spawnSession({
        projectId,
        projectPath: '/tmp',
        label: 'L',
        phase: 'develop',
        sourceFile: null,
        userContext: 'the original prompt',
        permissionMode: 'acceptEdits',
        correctionNote: 'fix the lint warnings',
      })
    } catch {
      // expected
    }

    const row = db
      .prepare(`SELECT user_context, permission_mode, correction_note FROM sessions WHERE project_id = ?`)
      .get(projectId) as
      | { user_context: string | null; permission_mode: string | null; correction_note: string | null }
      | undefined

    expect(row?.user_context).toBe('the original prompt')
    expect(row?.permission_mode).toBe('acceptEdits')
    expect(row?.correction_note).toBe('fix the lint warnings')
  })
})
