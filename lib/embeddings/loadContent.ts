import fs from 'fs'
import path from 'path'
import type Database from 'better-sqlite3'

export type EmbedKind = 'doc' | 'spec' | 'plan' | 'session_summary' | 'task'

export function loadContent(
  db: Database.Database,
  projectId: string,
  kind: EmbedKind,
  ref: string,
): string | null {
  if (kind === 'doc' || kind === 'spec' || kind === 'plan') {
    const project = db
      .prepare(`SELECT path FROM projects WHERE id = ?`)
      .get(projectId) as { path: string } | undefined
    if (!project) return null
    const filePath = path.join(project.path, ref)
    try {
      return fs.readFileSync(filePath, 'utf8')
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
  }
  if (kind === 'session_summary') {
    const row = db
      .prepare(`SELECT summary FROM sessions WHERE id = ?`)
      .get(ref) as { summary: string | null } | undefined
    return row?.summary ?? null
  }
  if (kind === 'task') {
    const row = db
      .prepare(`SELECT title, idea_file FROM tasks WHERE id = ?`)
      .get(ref) as { title: string; idea_file: string | null } | undefined
    if (!row) return null
    const desc = row.idea_file?.replace(/^file:\/\//, '') ?? ''
    return `${row.title}\n${desc}`
  }
  return null
}
