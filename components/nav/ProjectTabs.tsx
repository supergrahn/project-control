'use client'
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useProjectStore, type Project } from '@/hooks/useProjects'
import { ProjectSwitcherModal } from '@/components/ProjectSwitcherModal'

export function ProjectTabs() {
  const { openProjects, activeProjectId, openProject, closeProject } = useProjectStore()
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <div className="flex items-center border-b border-zinc-800 bg-zinc-950 overflow-x-auto min-h-[34px]">
        {openProjects.map((p) => (
          <div
            key={p.id}
            className={`flex items-center gap-1.5 px-3 h-[34px] cursor-pointer whitespace-nowrap select-none group transition-colors border-r border-zinc-800 ${
              p.id === activeProjectId
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
            }`}
            onClick={() => openProject(p)}
          >
            <span className="text-xs">{p.name}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); closeProject(p.id) }}
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 rounded p-0.5 hover:bg-zinc-600 transition-opacity"
            >
              <X size={10} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="px-2 flex items-center h-[34px] text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0"
          title="Open project (Ctrl+P)"
        >
          <Plus size={14} />
        </button>
      </div>

      {modalOpen && (
        <ProjectSwitcherModal
          onSelect={(p: Project) => openProject(p)}
          onClose={() => setModalOpen(false)}
          openProjectIds={openProjects.map((p) => p.id)}
        />
      )}
    </>
  )
}
