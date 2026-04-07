import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import {
  getTaskSourceConfig,
  listTaskSourceConfigs,
  upsertTaskSourceConfig,
  deleteTaskSourceConfig,
  toggleTaskSourceActive,
} from '@/lib/db/taskSourceConfig'
import { getTaskSourceAdapter } from '@/lib/taskSources/adapters'
import { startPolling, stopPolling } from '@/lib/taskSources/pollManager'

type RouteParams = { params: Promise<{ id: string }> }

// GET: Returns all task source configs for the project (passwords redacted)
export async function GET(req: Request, { params }: RouteParams) {
  const { id: projectId } = await params
  const db = getDb()
  const configs = listTaskSourceConfigs(db, projectId)

  const redacted = configs.map(cfg => {
    const adapter = getTaskSourceAdapter(cfg.adapter_key)
    const redactedConfig = { ...cfg.config }
    for (const field of adapter.configFields) {
      if (field.type === 'password' && redactedConfig[field.key]) {
        redactedConfig[field.key] = '••••••••'
      }
    }
    return { ...cfg, config: redactedConfig }
  })

  return NextResponse.json(redacted)
}

// PUT: Create or update a specific adapter config
export async function PUT(req: Request, { params }: RouteParams) {
  const { id: projectId } = await params
  const { adapterKey, config, resourceIds = [] } = await req.json()

  if (!adapterKey || !config) {
    return NextResponse.json({ error: 'adapterKey and config required' }, { status: 400 })
  }

  const adapter = getTaskSourceAdapter(adapterKey)
  const db = getDb()
  const existing = getTaskSourceConfig(db, projectId, adapterKey)

  // Strip redacted placeholders — keep existing passwords
  for (const field of adapter.configFields) {
    if (field.type === 'password' && config[field.key] === '••••••••') {
      config[field.key] = existing?.config[field.key] ?? ''
    }
  }

  // Validate required fields
  for (const field of adapter.configFields) {
    if (field.required && !config[field.key]) {
      return NextResponse.json({ error: `${field.label} is required` }, { status: 400 })
    }
  }

  upsertTaskSourceConfig(db, projectId, adapterKey, config, resourceIds)
  startPolling(projectId, adapterKey)

  return NextResponse.json({ ok: true })
}

// DELETE: Remove a specific adapter config
export async function DELETE(req: Request, { params }: RouteParams) {
  const { id: projectId } = await params
  const { searchParams } = new URL(req.url)
  const adapterKey = searchParams.get('adapterKey')
  const deleteTasks = searchParams.get('deleteTasks') === 'true'

  if (!adapterKey) {
    return NextResponse.json({ error: 'adapterKey required' }, { status: 400 })
  }

  const db = getDb()
  stopPolling(projectId, adapterKey)
  deleteTaskSourceConfig(db, projectId, adapterKey)

  if (deleteTasks) {
    db.prepare('DELETE FROM tasks WHERE project_id = ? AND source = ?').run(projectId, adapterKey)
  }

  return NextResponse.json({ ok: true })
}

// PATCH: Toggle active/inactive for a specific adapter
export async function PATCH(req: Request, { params }: RouteParams) {
  const { id: projectId } = await params
  const { adapterKey, is_active } = await req.json()

  if (!adapterKey) {
    return NextResponse.json({ error: 'adapterKey required' }, { status: 400 })
  }

  const db = getDb()
  toggleTaskSourceActive(db, projectId, adapterKey, is_active)

  if (is_active) {
    startPolling(projectId, adapterKey)
  } else {
    stopPolling(projectId, adapterKey)
  }

  return NextResponse.json({ ok: true })
}
