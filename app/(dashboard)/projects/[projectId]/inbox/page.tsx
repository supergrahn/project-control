'use client'
import { useParams } from 'next/navigation'
import useSWR from 'swr'
import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { fetcher } from '@/lib/fetcher'

type InboxComment = {
  id: string
  source: string
  task_source_id: string
  author: string
  body: string
  created_at: string
  task_title: string | null
  source_url: string | null
}

const SOURCE_COLORS: Record<string, string> = {
  jira:     'bg-blue-500/15 text-blue-400 border-blue-500/20',
  github:   'bg-gray-500/15 text-gray-300 border-gray-500/20',
  monday:   'bg-purple-500/15 text-purple-400 border-purple-500/20',
  donedone: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
}

const SOURCE_LABELS: Record<string, string> = {
  jira:     'Jira',
  github:   'GitHub',
  monday:   'Monday',
  donedone: 'DoneDone',
}

export default function InboxPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data, isLoading, error } = useSWR<{ comments: InboxComment[] }>(
    `/api/projects/${projectId}/inbox`,
    fetcher,
    { refreshInterval: 60_000 }
  )
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<string[]>([])

  const comments = data?.comments ?? []
  const sources = Array.from(new Set(comments.map(c => c.source)))
  const filtered = activeFilter ? comments.filter(c => c.source === activeFilter) : comments

  function toggleExpand(id: string) {
    setExpandedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Inbox</h1>
        <p className="text-sm text-text-secondary mt-1">
          Comments from your external tasks, newest first.
        </p>
      </div>

      {/* Source filter pills */}
      {sources.length > 0 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          <button
            onClick={() => setActiveFilter(null)}
            className={`px-3 py-1 rounded-full text-[12px] border cursor-pointer transition-colors ${
              activeFilter === null
                ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30'
                : 'bg-bg-secondary text-text-secondary border-border-default'
            }`}
          >
            All
          </button>
          {sources.map(source => (
            <button
              key={source}
              onClick={() => setActiveFilter(activeFilter === source ? null : source)}
              className={`px-3 py-1 rounded-full text-[12px] border cursor-pointer transition-colors ${
                activeFilter === source
                  ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30'
                  : 'bg-bg-secondary text-text-secondary border-border-default'
              }`}
            >
              {SOURCE_LABELS[source] ?? source}
            </button>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="text-text-muted text-sm">Loading...</div>
      )}

      {error && (
        <div className="text-status-error text-sm py-4">
          Failed to load inbox. Please try again.
        </div>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="text-text-muted text-sm py-12 text-center">
          No comments yet — comments will appear here as tasks sync.
        </div>
      )}

      <div className="flex flex-col gap-px">
        {filtered.map(comment => {
          const isExpanded = expandedIds.includes(comment.id)
          const isLong = comment.body.length > 200
          const displayBody = isExpanded || !isLong
            ? comment.body
            : comment.body.slice(0, 200) + '…'

          return (
            <div
              key={comment.id}
              className="py-4 border-b border-border-default last:border-0"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  {/* Header row */}
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`text-[11px] px-2 py-0.5 rounded border ${SOURCE_COLORS[comment.source] ?? 'bg-bg-secondary text-text-muted border-border-default'}`}>
                      {SOURCE_LABELS[comment.source] ?? comment.source}
                    </span>
                    {comment.task_title && (
                      comment.source_url ? (
                        <a
                          href={comment.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[13px] text-text-primary font-medium hover:text-accent-blue truncate max-w-[320px]"
                        >
                          {comment.task_title}
                        </a>
                      ) : (
                        <span className="text-[13px] text-text-primary font-medium truncate max-w-[320px]">
                          {comment.task_title}
                        </span>
                      )
                    )}
                    {!comment.task_title && (
                      <span className="text-[13px] text-text-muted">{comment.task_source_id}</span>
                    )}
                  </div>

                  {/* Author + time */}
                  <div className="text-[12px] text-text-muted mb-2">
                    <span className="text-text-secondary font-medium">{comment.author}</span>
                    {' · '}
                    {comment.created_at
                      ? formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })
                      : 'unknown time'}
                  </div>

                  {/* Body */}
                  <p className="text-[13px] text-text-secondary whitespace-pre-wrap leading-relaxed">
                    {displayBody}
                  </p>
                  {isLong && (
                    <button
                      onClick={() => toggleExpand(comment.id)}
                      className="text-[12px] text-accent-blue mt-1 cursor-pointer bg-transparent border-none p-0"
                    >
                      {isExpanded ? 'Show less' : 'Show more'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
