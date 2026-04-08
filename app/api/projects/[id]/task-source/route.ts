import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import {
  getTaskSourceConfig,
  listTaskSourceConfigs,
  upsertTaskSourceConfig,
  deleteTaskSourceConfig,
  toggleTaskSourceActive,
} from '@/lib/db/taskSourceConfig'
import { deleteTasksBySource } from '@/lib/db/tasks'
import { getTaskSourceAdapter } from '@/lib/taskSources/adapters'
import { startPolling, stopPolling } from '@/lib/taskSources/pollManager'

type RouteParams = { params: Promise<{ id: string }> }

// GET: Returns all task source configs for the project (passwords redacted)
export async function GET(req: Request, { params }: RouteParams) {
  const { id: projectId } = await params
  const db = getDb()
  const configs = listTaskSourceConfigs(db, projectId)

  const redacted = configs.map(cfg => {
    try {
      const adapter = getTaskSourceAdapter(cfg.adapter_key)
      const redactedConfig = { ...cfg.config }
      for (const field of adapter.configFields) {
        if (field.type === 'password' && redactedConfig[field.key]) {
          redactedConfig[field.key] = '••••••••'
        }
      }
      return { ...cfg, config: redactedConfig }
    } catch {
      // Unknown adapter (e.g. removed plugin) — return config unredacted but safe
      return cfg
    }
  })

  return NextResponse.json(redacted)
}

// PUT: Create or update a specific adapter config
export async function PUT(req: Request, { params }: RouteParams) {
  const { id: projectId } = await params
  const rawBody = await req.json() as unknown
  if (
    typeof rawBody !== 'object' ||
    rawBody === null ||
    typeof (rawBody as any).adapterKey !== 'string' ||
    !(rawBody as any).adapterKey.trim() ||
    typeof (rawBody as any).config !== 'object' ||
    (rawBody as any).config === null
  ) {
    return NextResponse.json({ error: 'adapterKey (string) and config (object) are required' }, { status: 400 })
  }
  const { adapterKey, config, resourceIds = [] } = rawBody as any

  let adapter: ReturnType<typeof getTaskSourceAdapter>
  try {
    adapter = getTaskSourceAdapter(adapterKey)
  } catch {
    return NextResponse.json({ error: `Unknown adapter: ${adapterKey}` }, { status: 400 })
  }
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
    deleteTasksBySource(db, projectId, adapterKey)
  }

  return NextResponse.json({ ok: true })
}

// PATCH: Toggle active/inactive for a specific adapter
export async function PATCH(req: Request, { params }: RouteParams) {
  const { id: projectId } = await params
  const rawBody = await req.json() as unknown
  if (
    typeof rawBody !== 'object' ||
    rawBody === null ||
    typeof (rawBody as any).adapterKey !== 'string' ||
    !(rawBody as any).adapterKey.trim()
  ) {
    return NextResponse.json({ error: 'adapterKey is required' }, { status: 400 })
  }
  const { adapterKey, is_active } = rawBody as any

  const db = getDb()
  toggleTaskSourceActive(db, projectId, adapterKey, is_active)

  if (is_active) {
    startPolling(projectId, adapterKey)
  } else {
    stopPolling(projectId, adapterKey)
  }

  return NextResponse.json({ ok: true })
}
