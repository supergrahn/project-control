import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { getDb, getProject } from '@/lib/db'
import { createSkill, getSkillsByProject } from '@/lib/db/skills'

function generateKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  return NextResponse.json(getSkillsByProject(getDb(), projectId))
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { projectId, name, key: providedKey } = body
  if (!projectId || !name?.trim()) {
    return NextResponse.json({ error: 'projectId and name required' }, { status: 400 })
  }
  const db = getDb()
  const project = getProject(db, projectId)
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const key = providedKey?.trim() ? providedKey.trim() : generateKey(name.trim())
  const skillsDir = path.join(project.path, '.skills')
  fs.mkdirSync(skillsDir, { recursive: true })
  const filePath = `.skills/${key}.md`
  fs.writeFileSync(
    path.join(project.path, filePath),
    `# ${name.trim()}\n\nDescribe what this skill does and how agents should use it.\n`,
    'utf8'
  )
  const skill = createSkill(db, { id: randomUUID(), projectId, name: name.trim(), key, file_path: filePath })
  return NextResponse.json(skill, { status: 201 })
}
