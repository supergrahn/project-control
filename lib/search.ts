import fs from 'fs'
import path from 'path'
import type Database from 'better-sqlite3'
import type { Project } from './db'
import { resolveMemoryDir, listMemoryFiles } from './memory'

export type SearchResult = {
  projectId: string
  projectName: string
  filePath: string
  fileType: string
  title: string
  snippet: string
}

export function rebuildSearchIndex(db: Database.Database, projects: Project[]): number {
  db.exec('DELETE FROM search_index')
  let count = 0

  for (const project of projects) {
    const dirs: Array<{ dir: string | null; type: string }> = [
      { dir: project.ideas_dir, type: 'idea' },
      { dir: project.specs_dir, type: 'spec' },
      { dir: project.plans_dir, type: 'plan' },
    ]

    for (const { dir, type } of dirs) {
      if (!dir) continue
      const absDir = path.resolve(project.path, dir)
      if (!fs.existsSync(absDir)) continue
      try {
        for (const f of fs.readdirSync(absDir)) {
          if (!f.endsWith('.md')) continue
          const filePath = path.join(absDir, f)
          try {
            const content = fs.readFileSync(filePath, 'utf8')
            const titleMatch = content.match(/^#\s+(.+)$/m)
            const title = titleMatch?.[1] ?? f.replace('.md', '')
            db.prepare('INSERT INTO search_index (project_id, project_name, file_path, file_type, title, content) VALUES (?, ?, ?, ?, ?, ?)')
              .run(project.id, project.name, filePath, type, title, content)
            count++
          } catch {}
        }
      } catch {}
    }

    // Index memory files
    const memDir = resolveMemoryDir(project.path)
    if (memDir) {
      for (const m of listMemoryFiles(memDir)) {
        db.prepare('INSERT INTO search_index (project_id, project_name, file_path, file_type, title, content) VALUES (?, ?, ?, ?, ?, ?)')
          .run(project.id, project.name, m.path, 'memory', m.name, m.content)
        count++
      }
    }
  }

  return count
}

export function searchContent(db: Database.Database, query: string, projectId?: string, limit: number = 20): SearchResult[] {
  if (!query.trim()) return []
  const ftsQuery = query.trim().split(/\s+/).map(w => `"${w}"`).join(' OR ')

  try {
    if (projectId) {
      return db.prepare(`
        SELECT project_id as projectId, project_name as projectName, file_path as filePath, file_type as fileType, title,
               snippet(search_index, 5, '<mark>', '</mark>', '...', 40) as snippet
        FROM search_index WHERE search_index MATCH ? AND project_id = ? ORDER BY rank LIMIT ?
      `).all(ftsQuery, projectId, limit) as SearchResult[]
    }
    return db.prepare(`
      SELECT project_id as projectId, project_name as projectName, file_path as filePath, file_type as fileType, title,
             snippet(search_index, 5, '<mark>', '</mark>', '...', 40) as snippet
      FROM search_index WHERE search_index MATCH ? ORDER BY rank LIMIT ?
    `).all(ftsQuery, limit) as SearchResult[]
  } catch {
    return []
  }
}
