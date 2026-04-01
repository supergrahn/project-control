import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import { getDb, getProject } from '@/lib/db'
import { getAgent } from '@/lib/db/agents'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const db = getDb()
  const agent = getAgent(db, id)
  if (!agent) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const project = getProject(db, agent.project_id)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  const filePath = path.join(project.path, agent.instructions_path ?? '', 'instructions.md')
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    return NextResponse.json({ content })
  } catch {
    return NextResponse.json({ content: '' })
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const db = getDb()
  const agent = getAgent(db, id)
  if (!agent) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const project = getProject(db, agent.project_id)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  const { content } = await req.json()
  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'content must be a string' }, { status: 400 })
  }

  const filePath = path.join(project.path, agent.instructions_path ?? '', 'instructions.md')
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf8')
  return NextResponse.json({ ok: true })
}
