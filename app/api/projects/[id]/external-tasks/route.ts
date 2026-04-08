import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { listTaskSourceConfigs } from '@/lib/db/taskSourceConfig'
import { getTaskSourceAdapter } from '@/lib/taskSources/adapters'
import type { ExternalTask, ExternalTaskStatus, ExternalTaskPriority } from '@/lib/types/externalTask'

export const dynamic = 'force-dynamic'

function mapToExternalStatus(raw: string): ExternalTaskStatus {
  const lower = raw.toLowerCase()
  if (lower === 'done' || lower === 'closed' || lower === 'resolved' ||
      lower === 'fixed' || lower === 'complete' || lower === 'completed') return 'done'
  if (lower === 'indeterminate' || lower.includes('progress') || lower === 'active' || lower === 'working') return 'inprogress'
  if (lower.includes('review') || lower.includes('test') || lower.includes('qa')) return 'review'
  if (lower.includes('block')) return 'blocked'
  return 'todo'
}

function mapToExternalPriority(raw: string | null): ExternalTaskPriority | null {
  if (!raw) return null
  const lower = raw.toLowerCase()
  if (lower === 'highest' || lower === 'critical') return 'critical'
  if (lower === 'high') return 'high'
  if (lower === 'medium') return 'medium'
  if (lower === 'low' || lower === 'lowest') return 'low'
  return 'medium'
}

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
      return raw.map((ext): ExternalTask => ({
        id: ext.sourceId,
        source: cfg.adapter_key as ExternalTask['source'],
        url: ext.url,
        title: ext.title,
        description: ext.description,
        status: mapToExternalStatus(ext.status),
        rawStatus: ext.status,
        priority: mapToExternalPriority(ext.priority),
        project: (ext.meta as any)?.fields?.project?.name           // Jira
          ?? (ext.meta as any)?.boardName                          // Monday (board name stored in meta)
          ?? (ext.meta as any)?.project?.name                      // DoneDone nested project object
          ?? (ext.meta as any)?.project_name                       // DoneDone flat
          ?? ((ext.meta as any)?.repository_url as string | undefined)?.split('/').slice(-2).join('/')  // GitHub
          ?? cfg.adapter_key,                                      // fallback
        labels: ext.labels,
        assignees: ext.assignees,
        dueDate: (ext.meta as any)?.fields?.duedate                // Jira
          ?? (ext.meta as any)?.due_date                           // DoneDone
          ?? (ext.meta as any)?.milestone?.due_on                  // GitHub milestone
          ?? (ext.meta as any)?.dueDate ?? null,
        createdAt: (ext.meta as any)?.fields?.created              // Jira
          ?? (ext.meta as any)?.created_at                         // DoneDone, GitHub, Monday
          ?? (ext.meta as any)?.createdAt ?? null,
        updatedAt: (ext.meta as any)?.fields?.updated              // Jira
          ?? (ext.meta as any)?.updated_at                         // DoneDone, GitHub, Monday
          ?? (ext.meta as any)?.updatedAt ?? null,
        meta: ext.meta as Record<string, unknown>,
      }))
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

  return NextResponse.json({ tasks, errors })
}
