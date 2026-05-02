'use client'

type StatusFilter = 'active' | 'ended' | 'all'

type Props = {
  status: StatusFilter
  onStatusChange: (s: StatusFilter) => void
  filteredCount: number
}

const PILLS: { key: StatusFilter; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'ended', label: 'Ended' },
  { key: 'all', label: 'All' },
]

export function SessionsHeader({ status, onStatusChange, filteredCount }: Props) {
  return (
    <div className="mb-5 flex items-center gap-4">
      <h1 className="text-lg font-semibold text-text-primary">Sessions</h1>
      <div className="flex items-center gap-1">
        {PILLS.map(p => (
          <button
            key={p.key}
            onClick={() => onStatusChange(p.key)}
            className={`text-xs px-2.5 py-1 rounded-md border transition ${
              status === p.key
                ? 'bg-bg-tertiary border-border-strong text-text-primary'
                : 'bg-transparent border-border-default text-text-muted hover:text-text-primary'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <span className="text-xs text-text-faint">{filteredCount} {filteredCount === 1 ? 'session' : 'sessions'}</span>
    </div>
  )
}
