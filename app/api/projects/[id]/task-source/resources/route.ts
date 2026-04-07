import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getTaskSourceConfig } from '@/lib/db/taskSourceConfig'
import { getTaskSourceAdapter } from '@/lib/taskSources/adapters'

type RouteParams = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: RouteParams) {
  const { id: projectId } = await params
  const { adapterKey, config } = await req.json()

  if (!adapterKey || !config) {
    return NextResponse.json({ error: 'adapterKey and config required' }, { status: 400 })
  }

  let adapter: ReturnType<typeof getTaskSourceAdapter>
  try {
    adapter = getTaskSourceAdapter(adapterKey)
  } catch {
    return NextResponse.json({ error: `Unknown adapter: ${adapterKey}` }, { status: 400 })
  }

  // Substitute redacted placeholder passwords with stored real credentials
  const db = getDb()
  const stored = getTaskSourceConfig(db, projectId, adapterKey)
  const resolvedConfig = { ...config }
  if (stored) {
    for (const field of adapter.configFields) {
      if (field.type === 'password' && resolvedConfig[field.key] === '••••••••') {
        resolvedConfig[field.key] = stored.config[field.key] ?? resolvedConfig[field.key]
      }
    }
  }

  try {
    const resources = await adapter.fetchAvailableResources(resolvedConfig)
    return NextResponse.json({ resources })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? 'Failed to fetch resources' },
      { status: 502 }
    )
  }
}
