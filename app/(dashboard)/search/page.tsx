'use client'
import { useState } from 'react'
import { Search as SearchIcon } from 'lucide-react'
import { useSearch } from '@/hooks/useSearch'

const TYPE_COLORS: Record<string, string> = {
  idea: 'bg-blue-500/20 text-blue-300',
  spec: 'bg-violet-500/20 text-violet-300',
  plan: 'bg-green-500/20 text-green-300',
  memory: 'bg-amber-500/20 text-amber-300',
  debrief: 'bg-zinc-500/20 text-zinc-400',
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const { data, isLoading } = useSearch(query)
  const results = data?.results ?? []

  return (
    <>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-text-primary flex items-center gap-2 mb-4">
          <SearchIcon size={18} className="text-accent-blue" /> Knowledge Search
        </h1>
        <div className="flex items-center gap-2 bg-bg-primary border border-border-default rounded-lg px-4 py-2.5">
          <SearchIcon size={14} className="text-text-muted" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search across all projects — ideas, specs, plans, memory..."
            className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder-text-faint"
            autoFocus
          />
          {query && <button onClick={() => setQuery('')} className="text-text-muted hover:text-text-secondary text-xs">Clear</button>}
        </div>
      </div>

      {isLoading && query.length >= 2 && <p className="text-text-muted text-sm">Searching...</p>}

      {results.length > 0 && (
        <div className="flex flex-col gap-2">
          {results.map((r, i) => (
            <div key={i} className="bg-bg-primary border border-border-default rounded-lg px-4 py-3 hover:border-border-strong transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${TYPE_COLORS[r.fileType] ?? TYPE_COLORS.memory}`}>{r.fileType}</span>
                <span className="text-xs text-text-muted">{r.projectName}</span>
              </div>
              <h3 className="text-sm font-semibold text-text-primary">{r.title}</h3>
              <p className="text-xs text-text-secondary mt-1" dangerouslySetInnerHTML={{ __html: r.snippet }} />
            </div>
          ))}
        </div>
      )}

      {query.length >= 2 && !isLoading && results.length === 0 && (
        <p className="text-text-muted text-sm text-center py-8">No results found for &quot;{query}&quot;</p>
      )}

      {query.length < 2 && (
        <p className="text-text-muted text-sm text-center py-8">Type at least 2 characters to search across all projects</p>
      )}
    </>
  )
}
