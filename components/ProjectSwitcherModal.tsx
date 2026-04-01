'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Plus, Search, FolderOpen } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useProjects, useScanFolders, useAddProject, useTouchProject, type Project } from '@/hooks/useProjects'

type Props = {
  onSelect: (p: Project) => void
  onClose: () => void
  openProjectIds: string[]
}

export function ProjectSwitcherModal({ onSelect, onClose, openProjectIds }: Props) {
  const { data: projects = [] } = useProjects()
  const { data: scanned = [] } = useScanFolders()
  const addProject = useAddProject()
  const touchProject = useTouchProject()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const unregistered = scanned.filter((f) => !projects.find((p) => p.path === f.path))

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()) ||
    p.path.toLowerCase().includes(query.toLowerCase())
  )
  const filteredUnreg = unregistered.filter((f) =>
    f.name.toLowerCase().includes(query.toLowerCase()) ||
    f.path.toLowerCase().includes(query.toLowerCase())
  )

  const totalItems = filtered.length + filteredUnreg.length

  const handleSelect = useCallback((p: Project) => {
    touchProject.mutate(p.id)
    onSelect(p)
    onClose()
  }, [touchProject, onSelect, onClose])

  const handleAddAndSelect = useCallback(async (f: { name: string; path: string }) => {
    try {
      const result = await addProject.mutateAsync({ name: f.name, path: f.path })
      const project: Project = result.id
        ? { id: result.id, name: f.name, path: f.path, ideas_dir: null, specs_dir: null, plans_dir: null, last_used_at: null }
        : result
      touchProject.mutate(project.id)
      onSelect(project)
    } catch {}
    onClose()
  }, [addProject, touchProject, onSelect, onClose])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, totalItems - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (cursor < filtered.length) {
          handleSelect(filtered[cursor])
        } else {
          const unregIdx = cursor - filtered.length
          if (filteredUnreg[unregIdx]) handleAddAndSelect(filteredUnreg[unregIdx])
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [cursor, filtered, filteredUnreg, totalItems, handleSelect, handleAddAndSelect, onClose])

  // Reset cursor when query changes
  useEffect(() => { setCursor(0) }, [query])

  // Auto-focus input
  useEffect(() => { inputRef.current?.focus() }, [])

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${cursor}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] bg-bg-overlay backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg bg-bg-primary border border-border-strong rounded-xl shadow-2xl overflow-hidden">
        {/* Search */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-default">
          <Search size={16} className="text-text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects…"
            className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-faint outline-none"
          />
          <kbd className="text-[10px] text-text-faint border border-border-default rounded px-1.5 py-0.5">esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {filtered.length === 0 && filteredUnreg.length === 0 && (
            <p className="px-4 py-6 text-sm text-text-muted text-center">
              {query ? 'No projects match.' : 'No projects yet. Check Settings.'}
            </p>
          )}

          {filtered.length > 0 && (
            <div>
              {query === '' && (
                <p className="px-4 pt-2 pb-1 text-[10px] text-text-faint uppercase tracking-wider">Projects</p>
              )}
              {filtered.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  data-idx={i}
                  onClick={() => handleSelect(p)}
                  onMouseEnter={() => setCursor(i)}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                    i === cursor ? 'bg-bg-secondary' : 'hover:bg-bg-secondary/50'
                  }`}
                >
                  <FolderOpen size={14} className={openProjectIds.includes(p.id) ? 'text-accent-blue' : 'text-text-muted'} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${openProjectIds.includes(p.id) ? 'text-accent-blue' : 'text-text-primary'}`}>
                      {p.name}
                    </p>
                    <p className="text-[11px] text-text-faint truncate">{p.path}</p>
                  </div>
                  {p.last_used_at && (
                    <span className="text-[10px] text-text-faint shrink-0">
                      {formatDistanceToNow(new Date(p.last_used_at), { addSuffix: true })}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {filteredUnreg.length > 0 && (
            <div className={filtered.length > 0 ? 'border-t border-border-default mt-1 pt-1' : ''}>
              <p className="px-4 pt-2 pb-1 text-[10px] text-text-faint uppercase tracking-wider">Add from git folder</p>
              {filteredUnreg.map((f, i) => {
                const idx = filtered.length + i
                return (
                  <button
                    key={f.path}
                    type="button"
                    data-idx={idx}
                    onClick={() => handleAddAndSelect(f)}
                    onMouseEnter={() => setCursor(idx)}
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                      idx === cursor ? 'bg-bg-secondary' : 'hover:bg-bg-secondary/50'
                    }`}
                  >
                    <Plus size={14} className="text-text-faint" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-secondary truncate">{f.name}</p>
                      <p className="text-[11px] text-text-faint truncate">{f.path}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="border-t border-border-default px-4 py-2 flex gap-4 text-[10px] text-text-faint">
          <span><kbd className="border border-border-default rounded px-1">↑↓</kbd> navigate</span>
          <span><kbd className="border border-border-default rounded px-1">↵</kbd> open</span>
          <span><kbd className="border border-border-default rounded px-1">esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
