import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getDb, listFeatureDeps, createFeatureDep, deleteFeatureDep } from '@/lib/db'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  return NextResponse.json(listFeatureDeps(getDb(), projectId))
}

export async function POST(req: Request) {
  const { projectId, featureKey, dependsOnKey } = await req.json()
  if (!projectId || !featureKey || !dependsOnKey) return NextResponse.json({ error: 'projectId, featureKey, dependsOnKey required' }, { status: 400 })
  const id = randomUUID()
  createFeatureDep(getDb(), { id, feature_key: featureKey, depends_on_key: dependsOnKey, project_id: projectId })
  return NextResponse.json({ id }, { status: 201 })
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  deleteFeatureDep(getDb(), id)
  return NextResponse.json({ ok: true })
}
