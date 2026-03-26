'use client'
import { useState } from 'react'
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

  const unregistered = scanned.filter((f) => !projects.find((p) => p.path === f.path))

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-200"
      >
        <FolderOpen size={14} />
        {selected?.name ?? 'Select project'}
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 w-64 rounded-md border border-zinc-700 bg-zinc-900 shadow-xl">
          {projects.length === 0 && unregistered.length === 0 && (
            <p className="px-3 py-3 text-xs text-zinc-500">No git projects found in ~/git</p>
          )}
          {projects.length > 0 && (
            <div className="p-1">
              <p className="px-2 py-1 text-xs text-zinc-500 uppercase tracking-wider">Projects</p>
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { onSelect(p); setOpen(false) }}
                  className="w-full text-left px-3 py-2 rounded text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          {unregistered.length > 0 && (
            <div className="border-t border-zinc-800 p-1">
              <p className="px-2 py-1 text-xs text-zinc-500 uppercase tracking-wider">Add from ~/git</p>
              {unregistered.map((f) => (
                <button
                  key={f.path}
                  onClick={async () => {
                    const result = await addProject.mutateAsync({ name: f.name, path: f.path })
                    if (result.id) onSelect({ ...f, id: result.id, ideas_dir: null, specs_dir: null, plans_dir: null })
                    else if (result.path) onSelect(result)
                    setOpen(false)
                  }}
                  className="w-full text-left px-3 py-2 rounded text-sm text-zinc-400 hover:bg-zinc-800 flex items-center gap-2"
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
