'use client'

import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { useParams } from 'next/navigation'
import { RefreshCw, AlertTriangle, Inbox } from 'lucide-react'
import type { ExternalTask, ExternalTaskPriority, ExternalTaskSource, ExternalTaskStatus } from '@/lib/types/externalTask'
import { parseAdapterErrors } from '@/lib/externalTasks/errorHints'
import { getDueDateStatus } from '@/lib/externalTasks/dueDate'
import { ExternalTaskCard } from './ExternalTaskCard'
import { ExternalTaskDetailDrawer } from './ExternalTaskDetailDrawer'
import { ExternalTaskFiltersBar, DEFAULT_FILTERS, ALL_SOURCES, ALL_STATUSES, ALL_PRIORITIES } from './ExternalTaskFilters'
import type { ExternalTaskFilters } from './ExternalTaskFilters'
import { ExternalStatsBar } from './ExternalStatsBar'
import { ExternalFocusQueue } from './ExternalFocusQueue'
import { ExternalKanbanBoard } from './ExternalKanbanBoard'
import { SOURCE_LABELS } from '@/lib/externalTasks/taskStyles'

type GroupBy = 'severity' | 'source' | 'status' | 'project' | 'flat' | 'assignee' | 'kanban' | 'focus'
type PriorityGroup = ExternalTaskPriority | 'none'

const PRIORITY_ORDER: PriorityGroup[] = ['critical', 'high', 'medium', 'low', 'none']
const PRIORITY_LABELS: Record<PriorityGroup, string> = {
  critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', none: 'No Priority',
}
const PRIORITY_BADGE_STYLES: Record<PriorityGroup, string> = {
  critical: 'bg-red-500/20 text-red-300',
  high:     'bg-orange-500/20 text-orange-300',
  medium:   'bg-yellow-500/20 text-yellow-300',
  low:      'bg-zinc-500/20 text-zinc-400',
  none:     'bg-zinc-800/40 text-zinc-500',
}

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'severity', label: 'Severity' },
  { value: 'source',   label: 'Source'   },
  { value: 'status',   label: 'Status'   },
  { value: 'project',  label: 'Project'  },
  { value: 'flat',     label: 'Flat'     },
  { value: 'assignee', label: 'Assignee' },
  { value: 'kanban',   label: 'Kanban'   },
  { value: 'focus',    label: 'Focus'    },
]

const fetcher = (url: string) => fetch(url).then(r => r.json())

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border-default bg-bg-secondary p-4 space-y-3 animate-pulse">
      <div className="flex gap-2">
        <div className="h-5 w-14 rounded-full bg-bg-tertiary" />
        <div className="h-5 w-12 rounded bg-bg-tertiary" />
      </div>
      <div className="h-4 w-3/4 rounded bg-bg-tertiary" />
      <div className="flex gap-2">
        <div className="h-3 w-20 rounded bg-bg-tertiary" />
        <div className="h-3 w-24 rounded bg-bg-tertiary" />
      </div>
    </div>
  )
}

export function ExternalTaskDashboard() {
  const { projectId } = useParams<{ projectId: string }>()

  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    if (typeof window === 'undefined') return 'severity'
    return (sessionStorage.getItem('ext-tasks-groupby') as GroupBy | null) ?? 'severity'
  })
  const [filters, setFilters] = useState<ExternalTaskFilters>(() => {
    if (typeof window === 'undefined') return DEFAULT_FILTERS
    try {
      const saved = sessionStorage.getItem('ext-tasks-filters')
      if (!saved) return DEFAULT_FILTERS
      const parsed = JSON.parse(saved)
      return {
        text: parsed.text ?? '',
        sources: new Set(parsed.sources ?? ['jira', 'monday', 'donedone', 'github']),
        statuses: new Set(parsed.statuses ?? ['todo', 'inprogress', 'review', 'blocked', 'done']),
        priorities: new Set(parsed.priorities ?? ['critical', 'high', 'medium', 'low', 'none']),
        dueDatePreset: parsed.dueDatePreset ?? 'all',
      }
    } catch { return DEFAULT_FILTERS }
  })
  const [selectedKey, setSelectedKey] = useState<{ source: string; id: string } | null>(null)
  const [showOverdueOnly, setShowOverdueOnly] = useState(false)

  const { data, isLoading, isValidating, mutate } = useSWR<{ tasks: ExternalTask[]; errors: string[] }>(
    `/api/projects/${projectId}/external-tasks`,
    fetcher,
    { refreshInterval: 120_000 }
  )

  const tasks = data?.tasks ?? []
  const apiErrors = data?.errors ?? []

  function changeGroupBy(g: GroupBy) {
    setGroupBy(g)
    try { sessionStorage.setItem('ext-tasks-groupby', g) } catch {}
  }

  function handleFiltersChange(next: ExternalTaskFilters) {
    setFilters(next)
    try {
      sessionStorage.setItem('ext-tasks-filters', JSON.stringify({
        text: next.text,
        sources: [...next.sources],
        statuses: [...next.statuses],
        priorities: [...next.priorities],
        dueDatePreset: next.dueDatePreset,
      }))
    } catch {}
  }

  const filteredTasks = useMemo(() => {
    let result = tasks
    if (filters.text.trim()) {
      const lower = filters.text.toLowerCase()
      result = result.filter(t =>
        t.title.toLowerCase().includes(lower) ||
        t.project.toLowerCase().includes(lower) ||
        (t.description?.toLowerCase().includes(lower) ?? false) ||
        t.labels.some(l => l.toLowerCase().includes(lower))
      )
    }
    if (filters.sources.size < ALL_SOURCES.length) {
      result = result.filter(t => filters.sources.has(t.source))
    }
    if (filters.statuses.size < ALL_STATUSES.length) {
      result = result.filter(t => filters.statuses.has(t.status))
    }
    if (filters.priorities.size < ALL_PRIORITIES.length) {
      result = result.filter(t => {
        const p = t.priority ?? 'none'
        return filters.priorities.has(p as any)
      })
    }
    if (filters.dueDatePreset !== 'all') {
      const now = new Date()
      result = result.filter(t => {
        if (filters.dueDatePreset === 'no-date') return !t.dueDate
        if (filters.dueDatePreset === 'overdue') return t.dueDate && new Date(t.dueDate) < now
        if (filters.dueDatePreset === 'today') {
          if (!t.dueDate) return false
          return new Date(t.dueDate).toDateString() === now.toDateString()
        }
        if (filters.dueDatePreset === 'this-week') {
          if (!t.dueDate) return false
          const due = new Date(t.dueDate)
          return due <= new Date(now.getTime() + 7 * 86_400_000) && due >= now
        }
        return true
      })
    }
    if (showOverdueOnly) {
      result = result.filter(t => getDueDateStatus(t.dueDate) === 'overdue')
    }
    return result
  }, [tasks, filters, showOverdueOnly])

  const overdueCount = useMemo(
    () => tasks.filter(t => getDueDateStatus(t.dueDate) === 'overdue').length,
    [tasks]
  )

  const groupedByPriority = useMemo(() => {
    const grouped = new Map<PriorityGroup, ExternalTask[]>()
    for (const g of PRIORITY_ORDER) grouped.set(g, [])
    for (const task of filteredTasks) {
      const key: PriorityGroup = task.priority ?? 'none'
      grouped.get(key)!.push(task)
    }
    return grouped
  }, [filteredTasks])

  const flatTasks = useMemo(
    () => PRIORITY_ORDER.flatMap(g => groupedByPriority.get(g) ?? []),
    [groupedByPriority]
  )

  const selectedTask = useMemo(
    () => selectedKey ? (flatTasks.find(t => t.source === selectedKey.source && t.id === selectedKey.id) ?? null) : null,
    [selectedKey, flatTasks]
  )

  // Priority summary counts for toolbar badges
  const priorityCounts = useMemo(() => {
    const counts: Partial<Record<PriorityGroup, number>> = {}
    for (const [p, list] of groupedByPriority) {
      if (list.length > 0) counts[p] = list.length
    }
    return counts
  }, [groupedByPriority])

  function getGroupedSections(): { key: string; label: string; tasks: ExternalTask[] }[] {
    switch (groupBy) {
      case 'severity':
        return PRIORITY_ORDER.map(p => ({
          key: p, label: PRIORITY_LABELS[p], tasks: groupedByPriority.get(p) ?? [],
        }))
      case 'source': {
        const order: ExternalTaskSource[] = ['jira', 'monday', 'donedone', 'github']
        const map = new Map<ExternalTaskSource, ExternalTask[]>()
        for (const s of order) map.set(s, [])
        for (const t of filteredTasks) map.get(t.source)?.push(t)
        return order.filter(s => (map.get(s)?.length ?? 0) > 0)
          .map(s => ({ key: s, label: SOURCE_LABELS[s], tasks: map.get(s)! }))
      }
      case 'status': {
        const order: ExternalTaskStatus[] = ['todo', 'inprogress', 'review', 'blocked', 'done']
        const labels: Record<ExternalTaskStatus, string> = {
          todo: 'To Do', inprogress: 'In Progress', review: 'Review / Testing', blocked: 'Blocked', done: 'Done',
        }
        const map = new Map<ExternalTaskStatus, ExternalTask[]>()
        for (const s of order) map.set(s, [])
        for (const t of filteredTasks) map.get(t.status)?.push(t)
        return order.filter(s => (map.get(s)?.length ?? 0) > 0)
          .map(s => ({ key: s, label: labels[s], tasks: map.get(s)! }))
      }
      case 'project': {
        const map = new Map<string, ExternalTask[]>()
        for (const t of filteredTasks) {
          if (!map.has(t.project)) map.set(t.project, [])
          map.get(t.project)!.push(t)
        }
        return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
          .map(([project, tasks]) => ({ key: project, label: project, tasks }))
      }
      case 'flat':
        return [{ key: 'flat', label: '', tasks: flatTasks }]
      case 'assignee': {
        const groups: Record<string, ExternalTask[]> = {}
        for (const task of filteredTasks) {
          const key = task.assignees[0] ?? 'Unassigned'
          if (!groups[key]) groups[key] = []
          groups[key].push(task)
        }
        const keys = Object.keys(groups).filter(k => k !== 'Unassigned').sort()
        if (groups['Unassigned']) keys.push('Unassigned')
        return keys.map(key => ({ key, label: key, tasks: groups[key] }))
      }
      case 'kanban': return []
      case 'focus': return []
    }
  }

  function renderContent() {
    if (isLoading) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )
    }

    if (groupBy === 'kanban') {
      return (
        <ExternalKanbanBoard
          tasks={filteredTasks}
          onSelect={t => setSelectedKey({ source: t.source, id: t.id })}
        />
      )
    }

    if (groupBy === 'focus') {
      return (
        <ExternalFocusQueue
          tasks={filteredTasks}
          onSelect={t => setSelectedKey({ source: t.source, id: t.id })}
        />
      )
    }

    const sections = getGroupedSections()
    const nonEmpty = sections.filter(s => s.tasks.length > 0)

    if (nonEmpty.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Inbox className="w-10 h-10 text-text-faint mb-3" />
          <p className="text-text-secondary text-sm">No tasks match the current filters.</p>
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-8">
        {nonEmpty.map(section => (
          <div key={section.key}>
            {section.label && (
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  {section.label}
                </h2>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-bg-tertiary text-text-secondary font-medium">
                  {section.tasks.length}
                </span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {section.tasks.map(task => (
                <ExternalTaskCard
                  key={`${task.source}:${task.id}`}
                  task={task}
                  onSelect={t => setSelectedKey({ source: t.source, id: t.id })}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  const parsedErrors = parseAdapterErrors(apiErrors)

  return (
    <div className="flex flex-col gap-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: priority badges + overdue toggle + count */}
        <div className="flex items-center gap-2 flex-wrap">
          {PRIORITY_ORDER.filter(p => (priorityCounts[p] ?? 0) > 0).map(p => (
            <span
              key={p}
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_BADGE_STYLES[p]}`}
            >
              {priorityCounts[p]} {PRIORITY_LABELS[p]}
            </span>
          ))}
          {overdueCount > 0 && (
            <button
              onClick={() => setShowOverdueOnly(v => !v)}
              className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${
                showOverdueOnly
                  ? 'bg-red-500/20 border-red-500/40 text-red-300'
                  : 'bg-transparent border-border-hover text-text-secondary hover:border-border-strong hover:text-text-primary'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              {overdueCount} overdue
            </button>
          )}
          <span className="text-xs text-text-muted">
            {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Right: group toggle + refresh */}
        <div className="flex items-center gap-2">
          {/* Mobile: native select */}
          <select
            value={groupBy}
            onChange={e => changeGroupBy(e.target.value as GroupBy)}
            className="sm:hidden text-xs bg-bg-tertiary border border-border-hover rounded-lg px-2 py-1.5 text-text-primary focus:outline-none focus:border-border-strong"
          >
            {GROUP_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Desktop: button strip */}
          <div className="hidden sm:flex items-center rounded-lg border border-border-default overflow-hidden">
            {GROUP_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => changeGroupBy(opt.value)}
                className={`text-xs px-2.5 py-1.5 border-r border-border-default last:border-r-0 transition-colors ${
                  groupBy === opt.value
                    ? 'bg-bg-tertiary text-text-primary'
                    : 'bg-transparent text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => mutate()}
            disabled={isValidating}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-border-default text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isValidating ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <ExternalStatsBar tasks={tasks} onStatusClick={(status) => {
        setFilters(prev => ({ ...prev, statuses: new Set([status]) }))
      }} />

      {/* Filters */}
      <ExternalTaskFiltersBar
        filters={filters}
        onChange={handleFiltersChange}
        resultCount={filteredTasks.length}
        totalCount={tasks.length}
      />

      {/* Adapter errors */}
      {parsedErrors.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {parsedErrors.map((err, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
              <span><strong className="text-amber-200">{err.source}:</strong> {err.message} — {err.hint}</span>
            </div>
          ))}
        </div>
      )}

      {/* Main content */}
      {renderContent()}

      {/* Detail drawer */}
      {selectedTask && (
        <ExternalTaskDetailDrawer
          task={selectedTask}
          tasks={flatTasks}
          onClose={() => setSelectedKey(null)}
          onNavigate={t => setSelectedKey({ source: t.source, id: t.id })}
        />
      )}
    </div>
  )
}
