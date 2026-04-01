import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

let db: ReturnType<typeof import('@/lib/db')['initDb']>

vi.mock('@/lib/db', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/db')>()
  db = orig.initDb(':memory:')
  return { ...orig, getDb: () => db }
})

const mockWriteFileSync = vi.fn()
const mockUnlinkSync = vi.fn()

vi.mock('fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: mockWriteFileSync,
    readFileSync: vi.fn().mockReturnValue('# Skill\n\nContent here.'),
    unlinkSync: mockUnlinkSync,
    existsSync: vi.fn().mockReturnValue(true),
  },
}))

function seed(pid: string, sid: string) {
  db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
    .run(pid, 'P', `/tmp/${pid}`, new Date().toISOString())
  db.prepare('INSERT INTO skills (id, project_id, name, key, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(sid, pid, 'Standards', 'standards', '.skills/standards.md', new Date().toISOString())
}

const p = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.resetModules() })

describe('GET /api/skills/[id]', () => {
  it('returns 404 for unknown id', async () => {
    const { GET } = await import('@/app/api/skills/[id]/route')
    expect((await GET(new NextRequest('http://localhost/api/skills/nope'), p('nope'))).status).toBe(404)
  })

  it('returns metadata + file content', async () => {
    seed('pa', 'sa')
    const { GET } = await import('@/app/api/skills/[id]/route')
    const body = await (await GET(new NextRequest('http://localhost/api/skills/sa'), p('sa'))).json()
    expect(body.id).toBe('sa')
    expect(body.content).toBe('# Skill\n\nContent here.')
  })
})

describe('PATCH /api/skills/[id]', () => {
  it('returns 404 for unknown id', async () => {
    const { PATCH } = await import('@/app/api/skills/[id]/route')
    expect((await PATCH(
      new NextRequest('http://localhost/api/skills/nope', { method: 'PATCH', body: JSON.stringify({ content: 'x' }) }),
      p('nope')
    )).status).toBe(404)
  })

  it('writes content to disk when content provided', async () => {
    seed('pb', 'sb')
    const { PATCH } = await import('@/app/api/skills/[id]/route')
    await PATCH(
      new NextRequest('http://localhost/api/skills/sb', { method: 'PATCH', body: JSON.stringify({ content: '# Updated\n\nNew.' }) }),
      p('sb')
    )
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.skills/standards.md'),
      '# Updated\n\nNew.',
      'utf8'
    )
  })

  it('updates name in DB when name provided', async () => {
    seed('pc', 'sc')
    const { PATCH } = await import('@/app/api/skills/[id]/route')
    const res = await PATCH(
      new NextRequest('http://localhost/api/skills/sc', { method: 'PATCH', body: JSON.stringify({ name: 'New Name' }) }),
      p('sc')
    )
    expect((await res.json()).name).toBe('New Name')
  })
})

describe('DELETE /api/skills/[id]', () => {
  it('returns 404 for unknown id', async () => {
    const { DELETE } = await import('@/app/api/skills/[id]/route')
    expect((await DELETE(
      new NextRequest('http://localhost/api/skills/nope', { method: 'DELETE' }),
      p('nope')
    )).status).toBe(404)
  })

  it('deletes DB record and calls unlinkSync', async () => {
    seed('pd', 'sd')
    const { DELETE } = await import('@/app/api/skills/[id]/route')
    const res = await DELETE(
      new NextRequest('http://localhost/api/skills/sd', { method: 'DELETE' }),
      p('sd')
    )
    expect((await res.json()).ok).toBe(true)
    expect(mockUnlinkSync).toHaveBeenCalledWith(expect.stringContaining('.skills/standards.md'))
    expect(db.prepare('SELECT * FROM skills WHERE id = ?').get('sd')).toBeUndefined()
  })
})
