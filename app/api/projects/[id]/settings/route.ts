import { NextResponse } from 'next/server'
import { getDb, getProject, updateProjectSettings } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const project = getProject(getDb(), id)
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(project)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const project = getProject(db, id)
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const body = await req.json()
  const settings: { ideas_dir?: string | null; specs_dir?: string | null; plans_dir?: string | null } = {}
  if ('ideas_dir' in body) {
    if (body.ideas_dir !== null && typeof body.ideas_dir !== 'string') {
      return NextResponse.json({ error: 'ideas_dir must be a string or null' }, { status: 400 })
    }
    settings.ideas_dir = body.ideas_dir
  }
  if ('specs_dir' in body) {
    if (body.specs_dir !== null && typeof body.specs_dir !== 'string') {
      return NextResponse.json({ error: 'specs_dir must be a string or null' }, { status: 400 })
    }
    settings.specs_dir = body.specs_dir
  }
  if ('plans_dir' in body) {
    if (body.plans_dir !== null && typeof body.plans_dir !== 'string') {
      return NextResponse.json({ error: 'plans_dir must be a string or null' }, { status: 400 })
    }
    settings.plans_dir = body.plans_dir
  }
  updateProjectSettings(db, id, settings)
  return NextResponse.json({ ok: true })
}
