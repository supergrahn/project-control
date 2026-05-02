import type { Database } from 'better-sqlite3'
import { prepareTask } from '@/lib/prep/prepareTask'

export type RefreshPrepPayload = { task_id: string }

export async function handleRefreshPrep(db: Database, payload: RefreshPrepPayload): Promise<void> {
  await prepareTask(db, payload.task_id)
}
