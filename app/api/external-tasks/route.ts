// GET /api/external-tasks — top-level aggregator across ALL projects.
// TimeBalloon's task sync hits this to populate its local pm_tasks cache, so
// the day-bucket composer can attribute work to real ticket IDs. Returns the
// wire shape the Tauri client decodes (incl. ownerProject {id, name}).
import { NextResponse } from 'next/server'
import { getDb, listProjects } from '@/lib/db'
import { listTaskSourceConfigs } from '@/lib/db/taskSourceConfig'
import { getTaskSourceAdapter } from '@/lib/taskSources/adapters'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = getDb()
  const projects = listProjects(db)
  const tasks: unknown[] = []
  const errors: string[] = []

  for (const project of projects) {
    const active = listTaskSourceConfigs(db, project.id).filter((c) => c.is_active)
    if (active.length === 0) continue

    const results = await Promise.allSettled(
      active.map(async (cfg) => {
        const adapter = getTaskSourceAdapter(cfg.adapter_key)
        const raw = await adapter.fetchTasks(cfg.config, cfg.resource_ids)
        return raw.map((ext) => {
          const meta = (ext.meta ?? {}) as Record<string, any>
          return {
            id: ext.sourceId,
            source: cfg.adapter_key,
            url: ext.url,
            title: ext.title,
            description: ext.description ?? null,
            status: adapter.mapStatus(ext.status),
            priority: ext.priority != null ? adapter.mapPriority(ext.priority) : null,
            // String fallback for older clients; ownerProject is the canonical link.
            project: project.name,
            ownerProject: { id: project.id, name: project.name },
            labels: ext.labels ?? [],
            assignees: ext.assignees ?? [],
            dueDate: meta?.fields?.duedate ?? meta?.due_date ?? meta?.dueDate ?? null,
            updatedAt: meta?.fields?.updated ?? meta?.updated_at ?? meta?.updatedAt ?? null,
          }
        })
      })
    )

    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      if (r.status === 'fulfilled') {
        tasks.push(...r.value)
      } else {
        errors.push(`${project.name}/${active[i].adapter_key}: ${(r as PromiseRejectedResult).reason?.message ?? 'error'}`)
      }
    }
  }

  return NextResponse.json({ tasks, errors })
}
