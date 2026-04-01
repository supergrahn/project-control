import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

import { GET, POST } from '@/app/api/providers/route'
import { NextRequest } from 'next/server'
import { getDb } from '@/lib/db'

beforeEach(() => {
  getDb().prepare('DELETE FROM providers').run()
})

describe('GET /api/providers', () => {
  it('returns an empty array when no providers exist', async () => {
    const res = await GET(new NextRequest('http://localhost/api/providers'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })
})

describe('POST /api/providers', () => {
  it('creates a provider and returns 201', async () => {
    const res = await POST(new NextRequest('http://localhost/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Claude Sonnet', type: 'claude', command: '/bin/claude', config: null }),
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('Claude Sonnet')
    expect(body.is_active).toBe(1)
  })

  it('returns 400 when name or command is missing', async () => {
    const res = await POST(new NextRequest('http://localhost/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Incomplete' }),
    }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when type is invalid', async () => {
    const res = await POST(new NextRequest('http://localhost/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', type: 'openai', command: '/bin/test', config: null }),
    }))
    expect(res.status).toBe(400)
  })
})
