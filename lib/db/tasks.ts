import type { Database } from 'better-sqlite3'
import type { TaskStatus, TaskPriority } from '@/lib/types'
export type { TaskStatus, TaskPriority } from '@/lib/types'

// Lazy import to avoid potential circular dependency at module load time
let logStatusChangeImpl: typeof import('./taskStatusLog')['logStatusChange'] | null = null
function getLogStatusChange() {
  if (!logStatusChangeImpl) {
    logStatusChangeImpl = require('./taskStatusLog').logStatusChange
  }
  return logStatusChangeImpl
}

export type Task = {
  id: string
  project_id: string
  title: string
  status: TaskStatus
  idea_file: string | null
  spec_file: string | null
  plan_file: string | null
  dev_summary: string | null
  commit_refs: string | null
  doc_refs: string | null
  notes: string | null
  priority: TaskPriority
  labels: string | null        // JSON array string
  assignee_agent_id: string | null
  provider_id: string | null
  session_log: string | null
  source: string | null
  source_id: string | null
  source_url: string | null
  source_meta: string | null
  is_deleted: number   // 0 or 1; managed by sync service, not user-editable
  created_at: string
  updated_at: string
}

export type CreateTaskInput = {
  id: string
  projectId: string
  title: string
  priority?: TaskPriority
  labels?: string[]
  assignee_agent_id?: string | null
  notes?: string
}

export function createTask(db: Database, input: CreateTaskInput): Task {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO tasks (id, project_id, title, status, priority, labels, assignee_agent_id, notes, created_at, updated_at)
    VALUES (?, ?, ?, 'idea', ?, ?, ?, ?, ?, ?)
  `).run(
    input.id,
    input.projectId,
    input.title,
    input.priority ?? 'medium',
    input.labels ? JSON.stringify(input.labels) : null,
    input.assignee_agent_id ?? null,
    input.notes ?? null,
    now,
    now,
  )
  return getTask(db, input.id)!
}

export function getTask(db: Database, id: string): Task | undefined {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined
}

export function getTasksByProject(
  db: Database,
  projectId: string,
  status?: TaskStatus
): Task[] {
  const PRIORITY_ORDER = `CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`
  if (status) {
    return db.prepare(
      `SELECT * FROM tasks WHERE project_id = ? AND status = ? AND (is_deleted = 0 OR is_deleted IS NULL) ORDER BY ${PRIORITY_ORDER}, updated_at DESC`
    ).all(projectId, status) as Task[]
  }
  return db.prepare(
    `SELECT * FROM tasks WHERE project_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) ORDER BY ${PRIORITY_ORDER}, updated_at DESC`
  ).all(projectId) as Task[]
}

export type UpdateTaskInput = {
  idea_file?: string | null
  spec_file?: string | null
  plan_file?: string | null
  dev_summary?: string | null
  commit_refs?: string[]
  doc_refs?: string[]
  notes?: string | null
  priority?: TaskPriority
  labels?: string[] | null
  assignee_agent_id?: string | null
  provider_id?: string | null
  session_log?: string | null
  title?: string
  status?: TaskStatus
  source?: string | null
  source_id?: string | null
  source_url?: string | null
  source_meta?: string | null
}

export function updateTask(db: Database, id: string, input: UpdateTaskInput): Task {
  const oldTask = getTask(db, id)
  const updates: string[] = []
  const values: unknown[] = []

  if ('idea_file' in input)   { updates.push('idea_file = ?');   values.push(input.idea_file) }
  if ('spec_file' in input)   { updates.push('spec_file = ?');   values.push(input.spec_file) }
  if ('plan_file' in input)   { updates.push('plan_file = ?');   values.push(input.plan_file) }
  if ('dev_summary' in input) { updates.push('dev_summary = ?'); values.push(input.dev_summary) }
  if ('commit_refs' in input) { updates.push('commit_refs = ?'); values.push(JSON.stringify(input.commit_refs)) }
  if ('doc_refs' in input)    { updates.push('doc_refs = ?');    values.push(JSON.stringify(input.doc_refs)) }
  if ('notes' in input)             { updates.push('notes = ?');             values.push(input.notes) }
  if ('priority' in input)          { updates.push('priority = ?');          values.push(input.priority) }
  if ('labels' in input)            { updates.push('labels = ?');            values.push(input.labels ? JSON.stringify(input.labels) : null) }
  if ('assignee_agent_id' in input) { updates.push('assignee_agent_id = ?'); values.push(input.assignee_agent_id) }
  if ('provider_id' in input)  { updates.push('provider_id = ?');  values.push(input.provider_id) }
  if ('session_log' in input)  { updates.push('session_log = ?');  values.push(input.session_log) }
  if ('title' in input)       { updates.push('title = ?');       values.push(input.title) }
  if ('status' in input)      { updates.push('status = ?');      values.push(input.status) }
  if ('source' in input)      { updates.push('source = ?');      values.push(input.source) }
  if ('source_id' in input)   { updates.push('source_id = ?');   values.push(input.source_id) }
  if ('source_url' in input)  { updates.push('source_url = ?');  values.push(input.source_url) }
  if ('source_meta' in input) { updates.push('source_meta = ?'); values.push(input.source_meta) }

  if (updates.length === 0) return getTask(db, id)!

  updates.push('updated_at = ?')
  values.push(new Date().toISOString(), id)

  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values)

  // Log status change if status was updated via updateTask (marked as 'sync')
  if ('status' in input && oldTask && oldTask.status !== input.status) {
    try {
      const logStatusChange = getLogStatusChange()
      logStatusChange(db, id, oldTask.status, input.status as TaskStatus, 'sync')
    } catch (e) {
      // Silently ignore logging errors - they shouldn't break the update
    }
  }

  return getTask(db, id)!
}

const STATUS_ORDER: TaskStatus[] = ['idea', 'speccing', 'planning', 'developing', 'done']

export function deleteTask(db: Database, id: string): void {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
}


export function advanceTaskStatus(db: Database, id: string, newStatus: TaskStatus): Task {
  const task = getTask(db, id)
  if (!task) throw new Error(`Task ${id} not found`)

  const currentIndex = STATUS_ORDER.indexOf(task.status)
  const newIndex = STATUS_ORDER.indexOf(newStatus)

  if (newIndex <= currentIndex) return task

  const now = new Date().toISOString()
  db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(newStatus, now, id)
  return getTask(db, id)!
}

// Separate transitionTaskStatus into a synchronous-friendly function
// Lazy require to avoid circular dependency at module load time
export function transitionTaskStatus(
  db: Database,
  id: string,
  newStatus: TaskStatus,
  reason?: string
): { task: Task; warnings: string[] } {
  // Lazy load to avoid circular dependency
  let isValidTransition: (from: TaskStatus, to: TaskStatus) => boolean
  let checkReadiness: (db: Database, task: Task, newStatus: TaskStatus) => string[]
  let logStatusChange: (db: Database, taskId: string, from: TaskStatus, to: TaskStatus, by: 'user' | 'sync' | 'session', reason?: string) => void

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sv = require('./statusValidation')
    isValidTransition = sv.isValidTransition
    checkReadiness = sv.checkReadiness
  } catch (e) {
    throw new Error(`Failed to load status validation: ${e}`)
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tsl = require('./taskStatusLog')
    logStatusChange = tsl.logStatusChange
  } catch (e) {
    throw new Error(`Failed to load task status log: ${e}`)
  }

  const task = getTask(db, id)
  if (!task) throw new Error(`Task ${id} not found`)

  if (!isValidTransition(task.status, newStatus)) {
    throw new Error(
      `Invalid transition: ${task.status} → ${newStatus}`
    )
  }

  const warnings = checkReadiness(db, task, newStatus)

  const now = new Date().toISOString()
  db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
    .run(newStatus, now, id)

  logStatusChange(db, id, task.status, newStatus, 'user', reason)

  return {
    task: getTask(db, id)!,
    warnings
  }
}

export function setTaskStatus(db: Database, id: string, status: TaskStatus): Task {
  const task = getTask(db, id)
  if (!task) throw new Error(`Task ${id} not found`)
  const now = new Date().toISOString()
  db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id)
  return getTask(db, id)!
}
