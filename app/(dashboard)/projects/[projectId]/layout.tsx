'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useProjects, useProjectStore } from '@/hooks/useProjects'
import { ProjectSwitcherModal } from '@/components/ProjectSwitcherModal'
import type { Project } from '@/hooks/useProjects'

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { projectId } = useParams<{ projectId: string }>()
  const { data: projects = [], isLoading } = useProjects()
  const { openProject } = useProjectStore()
  const [showSelector, setShowSelector] = useState(false)

  useEffect(() => {
    if (isLoading) return
    const project = projects.find(p => p.id === projectId)
    if (project) {
      openProject(project)
      setShowSelector(false)
    } else {
      setShowSelector(true)
    }
  }, [projectId, projects, isLoading, openProject])

  return (
    <>
      {children}
      {showSelector && (
        <ProjectSwitcherModal
          onSelect={(p: Project) => { openProject(p); setShowSelector(false) }}
          onClose={() => setShowSelector(false)}
          openProjectIds={[]}
        />
      )}
    </>
  )
}
