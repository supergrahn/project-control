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
      <div style={{
        width: 44,
        height: '100vh',
        background: '#0d0e10',
        borderRight: '1px solid #1e2124',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 8,
        paddingBottom: 8,
        gap: 6,
        flexShrink: 0,
        position: 'relative',
      }}>
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
          <div style={{
            position: 'absolute',
            left: 48,
            top: 8,
            background: '#1e2124',
            color: '#e2e6ea',
            fontSize: 12,
            padding: '4px 8px',
            borderRadius: 4,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 100,
          }}>
            {tooltip}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setShowWizard(true)}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: '#1e2124',
            color: '#8a9199',
            fontSize: 20,
            fontWeight: 300,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          +
        </button>
      </div>
      {showWizard && <NewProjectWizard onClose={() => setShowWizard(false)} />}
    </>
  )
}
