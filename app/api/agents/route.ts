import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import path from 'path'
import fs from 'fs'
import { getDb, getProject } from '@/lib/db'
import { createAgent, getAgentsByProject } from '@/lib/db/agents'

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }
  const db = getDb()
  const agents = getAgentsByProject(db, projectId)
  return NextResponse.json(agents)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { projectId, name, title, providerId, model } = body

  if (!projectId || !name?.trim()) {
    return NextResponse.json({ error: 'projectId and name required' }, { status: 400 })
  }

  const db = getDb()
  const project = getProject(db, projectId)
  if (!project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 })
  }

  const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const instructionsPath = `.agents/${slug}`
  const agentDir = path.join(project.path, instructionsPath)

  fs.mkdirSync(agentDir, { recursive: true })

  const starterInstructions = `# ${name.trim()}\n\nDescribe this agent's role, responsibilities, and behavioral guidelines here.\n`
  const instructionsFile = path.join(agentDir, 'instructions.md')
  if (!fs.existsSync(instructionsFile)) {
    fs.writeFileSync(instructionsFile, starterInstructions, 'utf8')
  }

  const agent = createAgent(db, {
    id: randomUUID(),
    projectId,
    name: name.trim(),
    title: title?.trim() || undefined,
    providerId: providerId || undefined,
    model: model?.trim() || undefined,
    instructionsPath,
  })

  return NextResponse.json(agent, { status: 201 })
}
