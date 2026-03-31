import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { readdirSync, existsSync } from 'fs'
import path from 'path'
import { getDb } from '@/lib/db'
import { createTask, getTasksByProject, updateTask } from '@/lib/db/tasks'
import type { TaskStatus } from '@/lib/db/tasks'

function getFileKey(filename: string): string {
  return filename.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '')
}

function listMdFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(dir, f))
}

function inferStatus(hasIdea: boolean, hasSpec: boolean, hasPlan: boolean): TaskStatus {
  if (hasPlan) return 'planning'
  if (hasSpec) return 'speccing'
  return 'idea'
}

export async function POST(req: NextRequest) {
  const { projectId } = await req.json()
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  const db = getDb()
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as {
    id: string; ideas_dir: string | null; specs_dir: string | null; plans_dir: string | null; path: string
  } | undefined

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const resolve = (rel: string | null) =>
    rel ? path.resolve(project.path, rel) : null

  const ideasDir = resolve(project.ideas_dir)
  const specsDir = resolve(project.specs_dir)
  const plansDir = resolve(project.plans_dir)

  const ideaFiles = ideasDir ? listMdFiles(ideasDir) : []
  const specFiles = specsDir ? listMdFiles(specsDir) : []
  const planFiles = plansDir ? listMdFiles(plansDir) : []

  // Build key→path maps
  const ideaMap = new Map(ideaFiles.map(f => [getFileKey(path.basename(f)), f]))
  const specMap = new Map(specFiles.map(f => [getFileKey(path.basename(f)), f]))
  const planMap = new Map(planFiles.map(f => [getFileKey(path.basename(f)), f]))

  const allKeys = new Set([...ideaMap.keys(), ...specMap.keys(), ...planMap.keys()])

  // Check existing tasks to avoid duplicates
  const existing = getTasksByProject(db, projectId)
  const existingTitles = new Set(existing.map(t => t.title))

  let created = 0
  let skipped = 0

  for (const key of allKeys) {
    const title = key.replace(/-/g, ' ')
    if (existingTitles.has(title)) { skipped++; continue }

    const ideaFile = ideaMap.get(key) ?? null
    const specFile = specMap.get(key) ?? null
    const planFile = planMap.get(key) ?? null
    const status = inferStatus(!!ideaFile, !!specFile, !!planFile)

    const task = createTask(db, { id: randomUUID(), projectId, title })
    updateTask(db, task.id, { idea_file: ideaFile, spec_file: specFile, plan_file: planFile })
    if (status !== 'idea') {
      db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, task.id)
    }
    created++
  }

  return NextResponse.json({ created, skipped })
}
