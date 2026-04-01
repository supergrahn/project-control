import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getDb, getProject } from '@/lib/db'
import { getSkill, updateSkill, deleteSkill } from '@/lib/db/skills'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getDb()
  const skill = getSkill(db, id)
  if (!skill) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const project = getProject(db, skill.project_id)
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  const content = fs.readFileSync(path.join(project.path, skill.file_path), 'utf8')
  return NextResponse.json({ ...skill, content })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getDb()
  const skill = getSkill(db, id)
  if (!skill) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json()
  if (body.content !== undefined) {
    const project = getProject(db, skill.project_id)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    fs.writeFileSync(path.join(project.path, skill.file_path), body.content, 'utf8')
  }
  if (body.name !== undefined) {
    updateSkill(db, id, { name: body.name })
  }
  return NextResponse.json(getSkill(db, id))
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getDb()
  const skill = getSkill(db, id)
  if (!skill) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const project = getProject(db, skill.project_id)
  if (project) {
    try { fs.unlinkSync(path.join(project.path, skill.file_path)) } catch {}
  }
  deleteSkill(db, id)
  return NextResponse.json({ ok: true })
}
