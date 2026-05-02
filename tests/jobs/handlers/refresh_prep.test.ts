import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initDb } from '@/lib/db'
import type { Database } from 'better-sqlite3'

const { prepareTaskMock } = vi.hoisted(() => ({ prepareTaskMock: vi.fn(async () => undefined) }))
vi.mock('@/lib/prep/prepareTask', () => ({ prepareTask: prepareTaskMock }))

import { handleRefreshPrep } from '@/lib/jobs/handlers/refresh_prep'

let db: Database
beforeEach(() => { db = initDb(':memory:'); prepareTaskMock.mockReset() })

describe('refresh_prep handler', () => {
  it('calls prepareTask with the supplied taskId', async () => {
    await handleRefreshPrep(db, { task_id: 'task-42' })
    expect(prepareTaskMock).toHaveBeenCalledWith(db, 'task-42')
  })
})
