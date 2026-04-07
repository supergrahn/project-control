'use client'

import { Search, X } from 'lucide-react'
import type { ExternalTaskSource, ExternalTaskStatus, ExternalTaskPriority } from '@/lib/types/externalTask'

export interface ExternalTaskFilters {
  text: string
  sources: Set<ExternalTaskSource>
  statuses: Set<ExternalTaskStatus>
  priorities: Set<ExternalTaskPriority | 'none'>
  dueDatePreset: 'all' | 'overdue' | 'today' | 'this-week' | 'no-date'
}

export const DEFAULT_FILTERS: ExternalTaskFilters = {
  text: '',
  sources: new Set<ExternalTaskSource>(['jira', 'monday', 'donedone', 'github']),
  statuses: new Set<ExternalTaskStatus>(['todo', 'inprogress', 'review', 'blocked', 'done']),
  priorities: new Set<ExternalTaskPriority | 'none'>(['critical', 'high', 'medium', 'low', 'none']),
  dueDatePreset: 'all',
}

export const ALL_SOURCES: { value: ExternalTaskSource; label: string }[] = [
  { value: 'jira', label: 'Jira' },
  { value: 'monday', label: 'Monday' },
  { value: 'donedone', label: 'DoneDone' },
  { value: 'github', label: 'GitHub' },
]

export const ALL_STATUSES: { value: ExternalTaskStatus; label: string }[] = [
  { value: 'todo', label: 'Todo' },
  { value: 'inprogress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
]

export const ALL_PRIORITIES: { value: ExternalTaskPriority | 'none'; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'None' },
]

export const DUE_DATE_PRESETS: { value: ExternalTaskFilters['dueDatePreset']; label: string }[] = [
  { value: 'all', label: 'Any' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'this-week', label: 'This week' },
  { value: 'no-date', label: 'No date' },
]

interface Props {
  filters: ExternalTaskFilters
  onChange: (filters: ExternalTaskFilters) => void
  resultCount: number
  totalCount: number
}

export function ExternalTaskFiltersBar({ filters, onChange, resultCount, totalCount }: Props) {
  function toggleSource(source: ExternalTaskSource) {
    const next = new Set(filters.sources)
    if (next.has(source)) {
      if (next.size === 1) return
      next.delete(source)
    } else {
      next.add(source)
    }
    onChange({ ...filters, sources: next })
  }

  function toggleStatus(status: ExternalTaskStatus) {
    const next = new Set(filters.statuses)
    if (next.has(status)) {
      if (next.size === 1) return
      next.delete(status)
    } else {
      next.add(status)
    }
    onChange({ ...filters, statuses: next })
  }

  function togglePriority(priority: ExternalTaskPriority | 'none') {
    const next = new Set(filters.priorities)
    if (next.has(priority)) {
      if (next.size === 1) return
      next.delete(priority)
    } else {
      next.add(priority)
    }
    onChange({ ...filters, priorities: next })
  }

  const isDefault =
    filters.text === '' &&
    filters.sources.size === ALL_SOURCES.length &&
    filters.statuses.size === ALL_STATUSES.length &&
    filters.priorities.size === ALL_PRIORITIES.length &&
    filters.dueDatePreset === 'all'

  return (
    <div className="flex flex-col gap-2">
      {/* Text search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
        <input
          type="text"
          placeholder="Search tasks..."
          value={filters.text}
          onChange={(e) => onChange({ ...filters, text: e.target.value })}
          className="w-full pl-8 pr-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"
        />
        {filters.text && (
          <button
            onClick={() => onChange({ ...filters, text: '' })}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Source pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-zinc-500 mr-1">Source:</span>
        {ALL_SOURCES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => toggleSource(value)}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
              filters.sources.has(value)
                ? 'bg-zinc-700 border-zinc-600 text-zinc-200'
                : 'bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="border-t border-zinc-800" />

      {/* Status pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-zinc-500 mr-1">Status:</span>
        {ALL_STATUSES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => toggleStatus(value)}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
              filters.statuses.has(value)
                ? 'bg-zinc-700 border-zinc-600 text-zinc-200'
                : 'bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="border-t border-zinc-800" />

      {/* Priority pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-zinc-500 mr-1">Priority:</span>
        {ALL_PRIORITIES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => togglePriority(value)}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
              filters.priorities.has(value)
                ? 'bg-zinc-700 border-zinc-600 text-zinc-200'
                : 'bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="border-t border-zinc-800" />

      {/* Due date preset pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-zinc-500 mr-1">Due:</span>
        {DUE_DATE_PRESETS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onChange({ ...filters, dueDatePreset: value })}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
              filters.dueDatePreset === value
                ? 'bg-zinc-700 border-zinc-600 text-zinc-200'
                : 'bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Result count + clear */}
      <div className="flex items-center justify-between text-xs text-zinc-500 pt-1">
        <span>
          {resultCount === totalCount
            ? `${totalCount} tasks`
            : `${resultCount} of ${totalCount} tasks`}
        </span>
        {!isDefault && (
          <button
            onClick={() => onChange(DEFAULT_FILTERS)}
            className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X className="w-3 h-3" />
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
