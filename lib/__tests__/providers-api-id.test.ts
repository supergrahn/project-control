import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

import { GET, PATCH, DELETE } from '@/app/api/providers/[id]/route'
import { NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { createProvider } from '@/lib/db/providers'

const p = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => { getDb().prepare('DELETE FROM providers').run() })

describe('GET /api/providers/[id]', () => {
  it('returns 404 for unknown id', async () => {
    expect((await GET(new NextRequest('http://localhost/api/providers/nope'), p('nope'))).status).toBe(404)
  })

  it('returns the provider when found', async () => {
    createProvider(getDb(), { id: 'get-1', name: 'Test', type: 'claude', command: '/bin/claude', config: null })
    const res = await GET(new NextRequest('http://localhost/api/providers/get-1'), p('get-1'))
    expect(res.status).toBe(200)
    expect((await res.json()).id).toBe('get-1')
  })
})

describe('PATCH /api/providers/[id]', () => {
  it('updates name', async () => {
    createProvider(getDb(), { id: 'patch-1', name: 'Old', type: 'codex', command: 'codex', config: null })
    const res = await PATCH(new NextRequest('http://localhost/api/providers/patch-1', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Name' }),
    }), p('patch-1'))
    expect((await res.json()).name).toBe('New Name')
  })

  it('toggles is_active when toggle_active is true', async () => {
    createProvider(getDb(), { id: 'tog-1', name: 'T', type: 'gemini', command: 'gemini', config: null })
    const res = await PATCH(new NextRequest('http://localhost/api/providers/tog-1', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toggle_active: true }),
    }), p('tog-1'))
    expect((await res.json()).is_active).toBe(0)
  })

  it('returns 404 for unknown id', async () => {
    const res = await PATCH(new NextRequest('http://localhost/api/providers/nobody', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X' }),
    }), p('nobody'))
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/providers/[id]', () => {
  it('deletes and returns ok', async () => {
    createProvider(getDb(), { id: 'del-1', name: 'Del', type: 'ollama', command: 'ollama', config: null })
    const res = await DELETE(new NextRequest('http://localhost/api/providers/del-1', { method: 'DELETE' }), p('del-1'))
    expect((await res.json()).ok).toBe(true)
  })

  it('returns 404 for unknown id', async () => {
    expect((await DELETE(new NextRequest('http://localhost/api/providers/nobody', { method: 'DELETE' }), p('nobody'))).status).toBe(404)
  })
})
