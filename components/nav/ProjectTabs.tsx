'use client'
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import { useProjectStore, type Project } from '@/hooks/useProjects'
import { ProjectSwitcherModal } from '@/components/ProjectSwitcherModal'

const WORKFLOW_SLUGS = ['ideas', 'specs', 'plans', 'developing', 'reports']

export function ProjectTabs() {
  const { openProjects, activeProjectId, openProject, closeProject } = useProjectStore()
  const [modalOpen, setModalOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  // Preserve the current workflow page when switching projects
  const currentSlug = WORKFLOW_SLUGS.find(s => pathname.includes(`/${s}`)) ?? 'ideas'

  const handleSelect = (p: Project) => {
    openProject(p)
    router.push(`/projects/${p.id}/${currentSlug}`)
  }

  return (
    <>
      <div className="flex items-center border-b border-border-default bg-bg-base overflow-x-auto min-h-[34px]">
        {openProjects.map((p) => (
          <div
            key={p.id}
            className={`flex items-center gap-1.5 px-3 h-[34px] cursor-pointer whitespace-nowrap select-none group transition-colors border-r border-border-default ${
              p.id === activeProjectId
                ? 'bg-bg-secondary text-text-primary'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-primary'
            }`}
            onClick={() => handleSelect(p)}
          >
            <span className="text-xs">{p.name}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); closeProject(p.id) }}
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 rounded p-0.5 hover:bg-text-muted transition-opacity"
            >
              <X size={10} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="px-2 flex items-center h-[34px] text-text-faint hover:text-text-primary hover:bg-bg-secondary transition-colors shrink-0"
          title="Open project (Ctrl+P)"
        >
          <Plus size={14} />
        </button>
      </div>
      {modalOpen && (
        <ProjectSwitcherModal
          onSelect={(p: Project) => { handleSelect(p); setModalOpen(false) }}
          onClose={() => setModalOpen(false)}
          openProjectIds={openProjects.map((p) => p.id)}
        />
      )}
    </>
  )
}
