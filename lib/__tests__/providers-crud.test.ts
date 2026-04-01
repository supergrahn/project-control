import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb } from '@/lib/db'
import type { Database } from 'better-sqlite3'
import {
  createProvider, getProvider, getProviders,
  updateProvider, deleteProvider, toggleProviderActive,
} from '@/lib/db/providers'

let db: Database

beforeEach(() => { db = initDb(':memory:') })
afterEach(() => { db.close() })

describe('createProvider', () => {
  it('inserts a provider and returns it with is_active=1', () => {
    const p = createProvider(db, {
      id: 'p-1', name: 'My Claude', type: 'claude',
      command: '/home/user/.local/bin/claude',
      config: JSON.stringify({ model: 'claude-sonnet-4-6', flags: ['--permission-mode', 'bypassPermissions'] }),
    })
    expect(p.id).toBe('p-1')
    expect(p.is_active).toBe(1)
    expect(p.created_at).toBeTruthy()
  })

  it('inserts a provider with null config', () => {
    const p = createProvider(db, { id: 'p-2', name: 'Ollama Local', type: 'ollama', command: 'ollama', config: null })
    expect(p.config).toBeNull()
  })
})

describe('getProvider', () => {
  it('returns undefined for unknown id', () => {
    expect(getProvider(db, 'nope')).toBeUndefined()
  })

  it('returns the provider by id', () => {
    createProvider(db, { id: 'p-3', name: 'Codex', type: 'codex', command: 'codex', config: null })
    expect(getProvider(db, 'p-3')?.name).toBe('Codex')
  })
})

describe('getProviders', () => {
  it('returns empty array when none exist', () => {
    expect(getProviders(db)).toEqual([])
  })

  it('returns all providers ordered by created_at ascending', () => {
    createProvider(db, { id: 'p-a', name: 'A', type: 'claude', command: 'claude', config: null })
    createProvider(db, { id: 'p-b', name: 'B', type: 'gemini', command: 'gemini', config: null })
    const all = getProviders(db)
    expect(all).toHaveLength(2)
    expect(all[0].id).toBe('p-a')
  })
})

describe('updateProvider', () => {
  it('updates name and command', () => {
    createProvider(db, { id: 'p-upd', name: 'Old', type: 'claude', command: '/old', config: null })
    const updated = updateProvider(db, 'p-upd', { name: 'New', command: '/new' })
    expect(updated.name).toBe('New')
    expect(updated.command).toBe('/new')
  })
})

describe('deleteProvider', () => {
  it('removes the provider', () => {
    createProvider(db, { id: 'p-del', name: 'Temp', type: 'ollama', command: 'ollama', config: null })
    deleteProvider(db, 'p-del')
    expect(getProvider(db, 'p-del')).toBeUndefined()
  })
})

describe('toggleProviderActive', () => {
  it('sets is_active to 0 when currently 1', () => {
    createProvider(db, { id: 'p-tog', name: 'Toggle', type: 'gemini', command: 'gemini', config: null })
    expect(toggleProviderActive(db, 'p-tog').is_active).toBe(0)
  })

  it('sets is_active to 1 when currently 0', () => {
    createProvider(db, { id: 'p-tog2', name: 'T2', type: 'gemini', command: 'gemini', config: null })
    db.prepare('UPDATE providers SET is_active = 0 WHERE id = ?').run('p-tog2')
    expect(toggleProviderActive(db, 'p-tog2').is_active).toBe(1)
  })
})
