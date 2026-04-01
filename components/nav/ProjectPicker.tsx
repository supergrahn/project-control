'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, FolderOpen, Plus } from 'lucide-react'
import { useProjects, useScanFolders, useAddProject, type Project } from '@/hooks/useProjects'

type Props = {
  selected: Project | null
  onSelect: (p: Project) => void
}

export function ProjectPicker({ selected, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const { data: projects = [] } = useProjects()
  const { data: scanned = [] } = useScanFolders()
  const addProject = useAddProject()
  const buttonRef = useRef<HTMLButtonElement>(null)

  const unregistered = scanned.filter((f) => !projects.find((p) => p.path === f.path))

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.closest('[data-picker]')?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  return (
    <div className="relative" data-picker="">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-bg-secondary hover:bg-bg-tertiary text-sm text-text-primary"
      >
        <FolderOpen size={14} />
        {selected?.name ?? 'Select project'}
        <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-[9999] w-64 max-h-[70vh] overflow-y-auto rounded-md border border-border-strong bg-bg-primary shadow-xl">
          {projects.length === 0 && unregistered.length === 0 && (
            <p className="px-3 py-3 text-xs text-text-muted">No git projects found in git_root folder. Check Settings.</p>
          )}
          {projects.length > 0 && (
            <div className="p-1">
              <p className="px-2 py-1 text-xs text-text-muted uppercase tracking-wider">Projects</p>
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onSelect(p); setOpen(false) }}
                  className={`w-full text-left px-3 py-2 rounded text-sm hover:bg-bg-secondary ${selected?.id === p.id ? 'text-accent-blue' : 'text-text-primary'}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          {unregistered.length > 0 && (
            <div className="border-t border-border-default p-1">
              <p className="px-2 py-1 text-xs text-text-muted uppercase tracking-wider">Add from git folder</p>
              {unregistered.map((f) => (
                <button
                  key={f.path}
                  type="button"
                  onClick={async () => {
                    try {
                      const result = await addProject.mutateAsync({ name: f.name, path: f.path })
                      const project: Project = result.id
                        ? { id: result.id, name: f.name, path: f.path, ideas_dir: null, specs_dir: null, plans_dir: null }
                        : result
                      onSelect(project)
                    } catch {}
                    setOpen(false)
                  }}
                  className="w-full text-left px-3 py-2 rounded text-sm text-text-secondary hover:bg-bg-secondary flex items-center gap-2"
                >
                  <Plus size={12} /> {f.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
