'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProjectStore } from '@/hooks/useProjects'
import { ProjectSwitcherModal } from '@/components/ProjectSwitcherModal'
import type { Project } from '@/hooks/useProjects'

export default function RootPage() {
  const { selectedProject, openProject } = useProjectStore()
  const router = useRouter()
  const [showSelector, setShowSelector] = useState(false)

  useEffect(() => {
    if (selectedProject) {
      router.replace(`/projects/${selectedProject.id}/ideas`)
    } else {
      setShowSelector(true)
    }
  }, [selectedProject, router])

  if (!showSelector) return null

  return (
    <ProjectSwitcherModal
      onSelect={(p: Project) => {
        openProject(p)
        router.push(`/projects/${p.id}/ideas`)
      }}
      onClose={() => setShowSelector(false)}
      openProjectIds={[]}
    />
  )
}
