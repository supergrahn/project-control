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
  const body = await req.json()
  updateProjectSettings(getDb(), id, body)
  return NextResponse.json({ ok: true })
}
