import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { listTaskSourceConfigs } from '@/lib/db/taskSourceConfig'
import { getTaskSourceAdapter } from '@/lib/taskSources/adapters'
import { mapExtToTask } from '@/lib/taskSources/mapExtToTask'
import type { ExternalTask } from '@/lib/types/externalTask'
import type { TaskPrepStatus } from '@/lib/db/tasks'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  const db = getDb()
  const configs = listTaskSourceConfigs(db, projectId)
  const activeConfigs = configs.filter(c => c.is_active)

  if (activeConfigs.length === 0) {
    return NextResponse.json({ tasks: [], errors: [] })
  }

  const results = await Promise.allSettled(
    activeConfigs.map(async (cfg) => {
      const adapter = getTaskSourceAdapter(cfg.adapter_key)
      const raw = await adapter.fetchTasks(cfg.config, cfg.resource_ids)
      return raw.map((ext): ExternalTask => mapExtToTask(ext, adapter, cfg))
    })
  )

  const tasks: ExternalTask[] = []
  const errors: string[] = []

  const adapterNames: Record<string, string> = {
    jira: 'Jira',
    monday: 'Monday',
    donedone: 'DoneDone',
    github: 'GitHub',
  }

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const name = adapterNames[activeConfigs[i].adapter_key] ?? activeConfigs[i].adapter_key
    if (result.status === 'fulfilled') {
      tasks.push(...result.value)
    } else {
      errors.push(`${name}: ${(result as PromiseRejectedResult).reason?.message ?? 'Unknown error'}`)
    }
  }

  // Bridge live-fetched ExternalTasks with prep state stored on the synced
  // tasks table row. One DB read per request, then a Map lookup per task.
  type PrepRow = {
    source: string
    source_id: string
    prep_notes: string | null
    prep_status: TaskPrepStatus | null
    prepped_at: string | null
  }
  const prepRows = db.prepare(
    `SELECT source, source_id, prep_notes, prep_status, prepped_at
       FROM tasks WHERE project_id = ? AND is_deleted = 0 AND source IS NOT NULL`,
  ).all(projectId) as PrepRow[]
  const prepBySource = new Map<string, { prep_notes: string | null; prep_status: PrepRow['prep_status']; prepped_at: string | null }>()
  for (const r of prepRows) {
    prepBySource.set(`${r.source}:${r.source_id}`, {
      prep_notes: r.prep_notes,
      prep_status: r.prep_status,
      prepped_at: r.prepped_at,
    })
  }
  for (const t of tasks) {
    const prep = prepBySource.get(`${t.source}:${t.id}`)
    t.prep_notes = prep?.prep_notes ?? null
    t.prep_status = prep?.prep_status ?? null
    t.prepped_at = prep?.prepped_at ?? null
  }

  return NextResponse.json({ tasks, errors })
}
