'use client'
import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useProjects, useProjectStore } from '@/hooks/useProjects'
import { DOT_COLORS } from '@/components/layout/Sidebar'
import { NewProjectWizard } from '@/components/projects/NewProjectWizard'

export function ProjectRail() {
  const router = useRouter()
  const params = useParams()
  const activeProjectId = params?.projectId as string | undefined
  const { data: projects = [] } = useProjects()
  const { openProject } = useProjectStore()
  const [showWizard, setShowWizard] = useState(false)
  const [tooltip, setTooltip] = useState<string | null>(null)

  return (
    <>
      <div className="w-11 h-screen bg-bg-base border-r border-border-subtle flex flex-col items-center py-2 gap-1.5 flex-shrink-0 relative">
        {projects.map((p, i) => (
          <button
            key={p.id}
            onClick={() => {
              openProject(p)
              router.push(`/projects/${p.id}`)
            }}
            onMouseEnter={() => setTooltip(p.name)}
            onMouseLeave={() => setTooltip(null)}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: DOT_COLORS[i % 5] + '40',
              color: DOT_COLORS[i % 5],
              fontSize: 14,
              fontWeight: 700,
              border: p.id === activeProjectId ? `2px solid ${DOT_COLORS[i % 5]}` : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {p.name[0]?.toUpperCase()}
          </button>
        ))}
        {tooltip && (
          <div className="absolute left-12 top-2 bg-border-subtle text-text-primary text-[12px] px-2 py-1 rounded pointer-events-none z-[100]">
            {tooltip}
          </div>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setShowWizard(true)}
          className="w-9 h-9 rounded-full bg-border-subtle text-text-secondary text-[20px] font-light border-none cursor-pointer flex items-center justify-center"
        >
          +
        </button>
      </div>
      {showWizard && <NewProjectWizard onClose={() => setShowWizard(false)} />}
    </>
  )
}
