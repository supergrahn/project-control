import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

vi.mock('@/lib/router/localComplete', () => ({
  localComplete: vi.fn(),
}))

import { getDb, createProject } from '@/lib/db'
import { createProvider } from '@/lib/db/providers'
import { createTask, getTask, setTaskComplexity } from '@/lib/db/tasks'
import { localComplete } from '@/lib/router/localComplete'
import { classifyComplexity } from '@/lib/router/classify'

const lc = localComplete as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM providers').run()
  db.prepare('DELETE FROM tasks').run()
  db.prepare('DELETE FROM projects').run()
  lc.mockReset()
})

function setup(): { taskId: string } {
  const db = getDb()
  const projectId = createProject(db, { name: 'P', path: '/tmp/p' })
  const taskId = randomUUID()
  createTask(db, { id: taskId, projectId, title: 'A long refactor', notes: 'cross-system' })
  return { taskId }
}

describe('classifyComplexity', () => {
  it('returns "normal" when taskId is undefined', async () => {
    const out = await classifyComplexity(getDb(), undefined)
    expect(out).toBe('normal')
    expect(lc).not.toHaveBeenCalled()
  })

  it('returns "normal" when task does not exist', async () => {
    const out = await classifyComplexity(getDb(), 'no-such-id')
    expect(out).toBe('normal')
    expect(lc).not.toHaveBeenCalled()
  })

  it('returns the cached complexity without calling the model', async () => {
    const { taskId } = setup()
    setTaskComplexity(getDb(), taskId, 'hard', false)
    const out = await classifyComplexity(getDb(), taskId)
    expect(out).toBe('hard')
    expect(lc).not.toHaveBeenCalled()
  })

  it('returns the user-overridden complexity without calling the model', async () => {
    const { taskId } = setup()
    setTaskComplexity(getDb(), taskId, 'trivial', true)
    const out = await classifyComplexity(getDb(), taskId)
    expect(out).toBe('trivial')
    expect(lc).not.toHaveBeenCalled()
  })

  it('falls back to "normal" when no local provider is configured', async () => {
    const { taskId } = setup()
    const out = await classifyComplexity(getDb(), taskId)
    expect(out).toBe('normal')
    expect(getTask(getDb(), taskId)?.complexity).toBe('normal')
    expect(lc).not.toHaveBeenCalled()
  })

  it('calls the model and caches the result on the task', async () => {
    const { taskId } = setup()
    createProvider(getDb(), { id: randomUUID(), name: 'L', type: 'ollama', command: 'ollama', config: null })
    lc.mockResolvedValue('  hard\n')
    const out = await classifyComplexity(getDb(), taskId)
    expect(out).toBe('hard')
    expect(getTask(getDb(), taskId)?.complexity).toBe('hard')
    expect(getTask(getDb(), taskId)?.complexity_overridden).toBe(0)
    // Prompt construction sanity: the task title and notes substituted in.
    expect(lc).toHaveBeenCalledTimes(1)
    const promptArg = lc.mock.calls[0][1] as string
    expect(promptArg).toContain('A long refactor')
    expect(promptArg).toContain('cross-system')
  })

  it('treats $-prefixed sequences in title/notes as literal text', async () => {
    // String.prototype.replace interprets $&, $1, etc. as backreferences when
    // given a string replacement; we use the function-form replacer to avoid that.
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: '/tmp/p' })
    const taskId = randomUUID()
    createTask(db, { id: taskId, projectId, title: '$& and $1 markers', notes: 'literal $`' })
    createProvider(db, { id: randomUUID(), name: 'L', type: 'ollama', command: 'ollama', config: null })
    lc.mockResolvedValue('normal')
    await classifyComplexity(db, taskId)
    const promptArg = lc.mock.calls[0][1] as string
    expect(promptArg).toContain('$& and $1 markers')
    expect(promptArg).toContain('literal $`')
  })

  it('parses junk model output as "normal"', async () => {
    const { taskId } = setup()
    createProvider(getDb(), { id: randomUUID(), name: 'L', type: 'ollama', command: 'ollama', config: null })
    lc.mockResolvedValue('I think this is going to be quite involved actually')
    const out = await classifyComplexity(getDb(), taskId)
    expect(out).toBe('normal')
  })

  it('falls back to "normal" when localComplete throws', async () => {
    const { taskId } = setup()
    createProvider(getDb(), { id: randomUUID(), name: 'L', type: 'ollama', command: 'ollama', config: null })
    lc.mockRejectedValue(new Error('timeout'))
    const out = await classifyComplexity(getDb(), taskId)
    expect(out).toBe('normal')
    expect(getTask(getDb(), taskId)?.complexity).toBe('normal')
  })
})
