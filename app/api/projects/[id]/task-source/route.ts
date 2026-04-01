import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getTaskSourceConfig, upsertTaskSourceConfig, deleteTaskSourceConfig, toggleTaskSourceActive } from '@/lib/db/taskSourceConfig'
import { getTaskSourceAdapter, listTaskSourceAdapters } from '@/lib/taskSources/adapters'
import { startPolling, stopPolling } from '@/lib/taskSources/pollManager'

type RouteParams = { params: Promise<{ id: string }> }

// GET: Returns project's task source config (redacting passwords)
export async function GET(req: Request, { params }: RouteParams) {
  const { id: projectId } = await params
  const db = getDb()
  const config = getTaskSourceConfig(db, projectId)
  if (!config) return NextResponse.json({ error: 'No task source configured' }, { status: 404 })

  // Redact password fields
  const adapter = getTaskSourceAdapter(config.adapter_key)
  const redactedConfig = { ...config.config }
  for (const field of adapter.configFields) {
    if (field.type === 'password' && redactedConfig[field.key]) {
      redactedConfig[field.key] = '••••••••'
    }
  }

  return NextResponse.json({ ...config, config: redactedConfig })
}

// PUT: Create or update task source config
export async function PUT(req: Request, { params }: RouteParams) {
  const { id: projectId } = await params
  const { adapterKey, config } = await req.json()

  if (!adapterKey || !config) {
    return NextResponse.json({ error: 'adapterKey and config required' }, { status: 400 })
  }

  // Validate adapter exists
  const adapter = getTaskSourceAdapter(adapterKey)
  const db = getDb()
  const existingConfig = getTaskSourceConfig(db, projectId)

  // Strip redacted placeholder values before validation
  for (const field of adapter.configFields) {
    if (field.type === 'password' && config[field.key] === '••••••••') {
      if (existingConfig) {
        config[field.key] = existingConfig.config[field.key]
      } else {
        config[field.key] = ''
      }
    }
  }

  // Validate required fields (after redaction stripping)
  for (const field of adapter.configFields) {
    if (field.required && !config[field.key]) {
      return NextResponse.json({ error: `${field.label} is required` }, { status: 400 })
    }
  }

  upsertTaskSourceConfig(db, projectId, adapterKey, config)
  startPolling(projectId)

  return NextResponse.json({ ok: true })
}

// DELETE: Remove task source config
export async function DELETE(req: Request, { params }: RouteParams) {
  const { id: projectId } = await params
  const { searchParams } = new URL(req.url)
  const deleteTasks = searchParams.get('deleteTasks') === 'true'

  const db = getDb()
  stopPolling(projectId)
  deleteTaskSourceConfig(db, projectId)

  if (deleteTasks) {
    db.prepare('DELETE FROM tasks WHERE project_id = ? AND source IS NOT NULL').run(projectId)
  }

  return NextResponse.json({ ok: true })
}

// PATCH: Toggle active/inactive
export async function PATCH(req: Request, { params }: RouteParams) {
  const { id: projectId } = await params
  const { is_active } = await req.json()

  const db = getDb()
  toggleTaskSourceActive(db, projectId, is_active)

  if (is_active) {
    startPolling(projectId)
  } else {
    stopPolling(projectId)
  }

  return NextResponse.json({ ok: true })
}
