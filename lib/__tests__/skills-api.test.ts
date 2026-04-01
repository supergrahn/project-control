import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

let db: ReturnType<typeof import('@/lib/db')['initDb']>

vi.mock('@/lib/db', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/db')>()
  db = orig.initDb(':memory:')
  return { ...orig, getDb: () => db }
})

vi.mock('fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('# Skill\n\nContent.'),
    existsSync: vi.fn().mockReturnValue(true),
    unlinkSync: vi.fn(),
  },
}))

afterEach(() => { vi.resetModules() })

describe('GET /api/skills', () => {
  it('returns 400 when projectId missing', async () => {
    const { GET } = await import('@/app/api/skills/route')
    const res = await GET(new NextRequest('http://localhost/api/skills'))
    expect(res.status).toBe(400)
  })

  it('returns empty array for project with no skills', async () => {
    db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
      .run('p1', 'P', '/tmp/p1', new Date().toISOString())
    const { GET } = await import('@/app/api/skills/route')
    const res = await GET(new NextRequest('http://localhost/api/skills?projectId=p1'))
    expect(await res.json()).toEqual([])
  })

  it('returns skill metadata without content field', async () => {
    db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
      .run('p2', 'P', '/tmp/p2', new Date().toISOString())
    db.prepare('INSERT INTO skills (id, project_id, name, key, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('sk1', 'p2', 'Standards', 'standards', '.skills/standards.md', new Date().toISOString())
    const { GET } = await import('@/app/api/skills/route')
    const body = await (await GET(new NextRequest('http://localhost/api/skills?projectId=p2'))).json()
    expect(body).toHaveLength(1)
    expect(body[0]).not.toHaveProperty('content')
    expect(body[0].key).toBe('standards')
  })
})

describe('POST /api/skills', () => {
  it('returns 400 when projectId or name missing', async () => {
    const { POST } = await import('@/app/api/skills/route')
    const res = await POST(new NextRequest('http://localhost/api/skills', {
      method: 'POST', body: JSON.stringify({ name: 'Standards' }),
    }))
    expect(res.status).toBe(400)
  })

  it('auto-generates key from name when not provided', async () => {
    db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
      .run('p3', 'P', '/tmp/p3', new Date().toISOString())
    const { POST } = await import('@/app/api/skills/route')
    const res = await POST(new NextRequest('http://localhost/api/skills', {
      method: 'POST', body: JSON.stringify({ projectId: 'p3', name: 'Coding Standards!' }),
    }))
    expect(res.status).toBe(201)
    expect((await res.json()).key).toBe('coding-standards')
  })

  it('uses provided key when given', async () => {
    db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
      .run('p4', 'P', '/tmp/p4', new Date().toISOString())
    const { POST } = await import('@/app/api/skills/route')
    const res = await POST(new NextRequest('http://localhost/api/skills', {
      method: 'POST', body: JSON.stringify({ projectId: 'p4', name: 'Git Flow', key: 'custom-key' }),
    }))
    expect((await res.json()).key).toBe('custom-key')
  })
})
