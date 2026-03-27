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
        <h1 className="text-lg font-semibold text-zinc-100 flex items-center gap-2 mb-4">
          <SearchIcon size={18} className="text-violet-400" /> Knowledge Search
        </h1>
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5">
          <SearchIcon size={14} className="text-zinc-500" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search across all projects — ideas, specs, plans, memory..."
            className="flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder-zinc-600"
            autoFocus
          />
          {query && <button onClick={() => setQuery('')} className="text-zinc-600 hover:text-zinc-400 text-xs">Clear</button>}
        </div>
      </div>

      {isLoading && query.length >= 2 && <p className="text-zinc-500 text-sm">Searching...</p>}

      {results.length > 0 && (
        <div className="flex flex-col gap-2">
          {results.map((r, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 hover:border-zinc-700 transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${TYPE_COLORS[r.fileType] ?? TYPE_COLORS.memory}`}>{r.fileType}</span>
                <span className="text-xs text-zinc-500">{r.projectName}</span>
              </div>
              <h3 className="text-sm font-semibold text-zinc-200">{r.title}</h3>
              <p className="text-xs text-zinc-400 mt-1" dangerouslySetInnerHTML={{ __html: r.snippet }} />
            </div>
          ))}
        </div>
      )}

      {query.length >= 2 && !isLoading && results.length === 0 && (
        <p className="text-zinc-600 text-sm text-center py-8">No results found for &quot;{query}&quot;</p>
      )}

      {query.length < 2 && (
        <p className="text-zinc-600 text-sm text-center py-8">Type at least 2 characters to search across all projects</p>
      )}
    </>
  )
}
