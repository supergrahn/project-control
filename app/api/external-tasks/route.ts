import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { listTaskSourceConfigs } from '@/lib/db/taskSourceConfig'
import { getTaskSourceAdapter } from '@/lib/taskSources/adapters'
import { mapExtToTask } from '@/lib/taskSources/mapExtToTask'
import type { ExternalTask } from '@/lib/types/externalTask'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = getDb()
  // projects table has no is_deleted column — select all projects
  const projects = db
    .prepare(`SELECT id, name FROM projects`)
    .all() as Array<{ id: string; name: string }>

  const perProject = await Promise.allSettled(
    projects.map(async (proj) => {
      const configs = listTaskSourceConfigs(db, proj.id).filter(c => c.is_active)
      if (configs.length === 0) {
        return {
          projectId: proj.id,
          projectName: proj.name,
          tasks: [] as ExternalTask[],
          errors: [] as string[],
        }
      }

      const settled = await Promise.allSettled(
        configs.map(async (cfg) => {
          const adapter = getTaskSourceAdapter(cfg.adapter_key)
          const raw = await adapter.fetchTasks(cfg.config, cfg.resource_ids)
          return raw.map((ext): ExternalTask => mapExtToTask(ext, adapter, cfg))
        }),
      )

      const tasks: ExternalTask[] = []
      const errors: string[] = []
      const adapterNames: Record<string, string> = {
        jira: 'Jira',
        monday: 'Monday',
        donedone: 'DoneDone',
        github: 'GitHub',
      }

      for (let i = 0; i < settled.length; i++) {
        const r = settled[i]
        const adapterName = adapterNames[configs[i].adapter_key] ?? configs[i].adapter_key
        if (r.status === 'fulfilled') {
          tasks.push(...r.value)
        } else {
          errors.push(
            `${proj.name} · ${adapterName}: ${(r as PromiseRejectedResult).reason?.message ?? 'Unknown error'}`,
          )
        }
      }

      // Bridge prep state for this project (same query pattern as project-scoped route)
      const prepRows = db
        .prepare(
          `SELECT source, source_id, prep_notes, prep_status, prepped_at FROM tasks
           WHERE project_id = ? AND is_deleted = 0 AND source IS NOT NULL`,
        )
        .all(proj.id) as Array<{
          source: string
          source_id: string
          prep_notes: string | null
          prep_status: string | null
          prepped_at: string | null
        }>

      const prepBySource = new Map(
        prepRows.map(r => [`${r.source}:${r.source_id}`, r]),
      )

      for (const t of tasks) {
        const prep = prepBySource.get(`${t.source}:${t.id}`)
        t.prep_notes = prep?.prep_notes ?? null
        t.prep_status = (prep?.prep_status as ExternalTask['prep_status']) ?? null
        t.prepped_at = prep?.prepped_at ?? null
        t.ownerProject = { id: proj.id, name: proj.name }
      }

      return { projectId: proj.id, projectName: proj.name, tasks, errors }
    }),
  )

  const allTasks: ExternalTask[] = []
  const allErrors: string[] = []

  for (const r of perProject) {
    if (r.status === 'fulfilled') {
      allTasks.push(...r.value.tasks)
      allErrors.push(...r.value.errors)
    } else {
      allErrors.push(
        `Project aggregation failed: ${(r as PromiseRejectedResult).reason?.message ?? 'Unknown'}`,
      )
    }
  }

  return NextResponse.json({ tasks: allTasks, errors: allErrors })
}
