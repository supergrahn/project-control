import type { Database } from 'better-sqlite3'

export type TaskStatus = 'idea' | 'speccing' | 'planning' | 'developing' | 'done'

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

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
}

export function createTask(db: Database, input: CreateTaskInput): Task {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO tasks (id, project_id, title, status, priority, labels, assignee_agent_id, created_at, updated_at)
    VALUES (?, ?, ?, 'idea', ?, ?, ?, ?, ?)
  `).run(
    input.id,
    input.projectId,
    input.title,
    input.priority ?? 'medium',
    input.labels ? JSON.stringify(input.labels) : null,
    input.assignee_agent_id ?? null,
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
  if (status) {
    return db.prepare(
      'SELECT * FROM tasks WHERE project_id = ? AND status = ? ORDER BY updated_at DESC'
    ).all(projectId, status) as Task[]
  }
  return db.prepare(
    'SELECT * FROM tasks WHERE project_id = ? ORDER BY updated_at DESC'
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

export function setTaskStatus(db: Database, id: string, status: TaskStatus): Task {
  const task = getTask(db, id)
  if (!task) throw new Error(`Task ${id} not found`)
  const now = new Date().toISOString()
  db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id)
  return getTask(db, id)!
}
