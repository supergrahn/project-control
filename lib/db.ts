import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import path from 'path'
import fs from 'fs'

export type Project = {
  id: string
  name: string
  path: string
  ideas_dir: string | null
  specs_dir: string | null
  plans_dir: string | null
  created_at: string
}

export type Session = {
  id: string
  project_id: string
  label: string
  phase: string
  source_file: string | null
  status: string
  created_at: string
}

const DB_PATH = path.join(process.cwd(), 'data', 'project-control.db')

export function initDb(dbPath = DB_PATH): Database.Database {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  }
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      path       TEXT UNIQUE NOT NULL,
      ideas_dir  TEXT,
      specs_dir  TEXT,
      plans_dir  TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id),
      label       TEXT NOT NULL,
      phase       TEXT NOT NULL,
      source_file TEXT,
      status      TEXT NOT NULL DEFAULT 'active',
      created_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
  return db
}

export function createProject(db: Database.Database, data: { name: string; path: string }): string {
  const id = randomUUID()
  db.prepare(`INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)`)
    .run(id, data.name, data.path, new Date().toISOString())
  return id
}

export function getProject(db: Database.Database, id: string): Project | undefined {
  return db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as Project | undefined
}

export function listProjects(db: Database.Database): Project[] {
  return db.prepare(`SELECT * FROM projects ORDER BY name`).all() as Project[]
}

export function getProjectByPath(db: Database.Database, path: string): Project | undefined {
  return db.prepare(`SELECT * FROM projects WHERE path = ?`).get(path) as Project | undefined
}

export function updateProjectSettings(
  db: Database.Database,
  id: string,
  settings: { ideas_dir?: string; specs_dir?: string; plans_dir?: string }
): void {
  db.prepare(`UPDATE projects SET ideas_dir = ?, specs_dir = ?, plans_dir = ? WHERE id = ?`)
    .run(settings.ideas_dir ?? null, settings.specs_dir ?? null, settings.plans_dir ?? null, id)
}

export function createSession(db: Database.Database, data: {
  id: string
  projectId: string
  label: string
  phase: string
  sourceFile: string | null
}): void {
  db.prepare(`INSERT INTO sessions (id, project_id, label, phase, source_file, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(data.id, data.projectId, data.label, data.phase, data.sourceFile, new Date().toISOString())
}

export function getActiveSessions(db: Database.Database): Session[] {
  return db.prepare(`SELECT * FROM sessions WHERE status = 'active' ORDER BY created_at DESC`).all() as Session[]
}

export function getActiveSessionForFile(db: Database.Database, sourceFile: string): Session | undefined {
  return db.prepare(`SELECT * FROM sessions WHERE source_file = ? AND status = 'active'`).get(sourceFile) as Session | undefined
}

export function endSession(db: Database.Database, id: string): void {
  db.prepare(`UPDATE sessions SET status = 'ended' WHERE id = ?`).run(id)
}

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) _db = initDb()
  return _db
}
