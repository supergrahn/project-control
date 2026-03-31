'use client'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useProjects, useUpdateSettings } from '@/hooks/useProjects'
import type { Project } from '@/hooks/useProjects'

type Props = { projectId: string; projectName: string }

const PAGE_LABELS: Record<string, string> = {
  ideas: 'Ideas',
  specs: 'Specs',
  plans: 'Plans',
  developing: 'Developing',
  done: 'Done',
  reports: 'Reports',
  settings: 'Settings',
}

function getPageLabel(pathname: string, projectId: string): string {
  const prefix = `/projects/${projectId}`
  const rest = pathname.slice(prefix.length).replace(/^\//, '')
  if (!rest) return 'Dashboard'
  const segment = rest.split('/')[0]
  return PAGE_LABELS[segment] ?? (segment.charAt(0).toUpperCase() + segment.slice(1))
}

export function TopBar({ projectId, projectName }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pageLabel = getPageLabel(pathname, projectId)

  return (
    <>
      <div style={{
        height: 38,
        background: '#0c0e10',
        borderBottom: '1px solid #1c1f22',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#5a6370', fontSize: 12, fontFamily: 'inherit' }}
          >
            {projectName}
          </button>
          <span style={{ color: '#2e3338', fontSize: 12, margin: '0 6px' }}>›</span>
          <span style={{ color: '#c8ced6', fontSize: 12, fontWeight: 500 }}>{pageLabel}</span>
        </div>
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open project settings"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 4px', color: '#5a6370', fontSize: 14, fontFamily: 'inherit' }}
        >
          ⚙
        </button>
      </div>
      {drawerOpen && (
        <SettingsDrawer projectId={projectId} onClose={() => setDrawerOpen(false)} />
      )}
    </>
  )
}

function SettingsDrawer({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { data: projects = [] } = useProjects()
  const project = projects.find(p => p.id === projectId) ?? null

  return (
    <>
      <div
        data-testid="drawer-overlay"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 199 }}
      />
      <aside style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
        background: '#141618',
        borderLeft: '1px solid #1e2124',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #1e2124', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#e2e6ea', fontSize: 14, fontWeight: 700 }}>Project Settings</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#5a6370', cursor: 'pointer', fontSize: 18, lineHeight: 1, fontFamily: 'inherit' }}>×</button>
        </div>
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {project
            ? <SettingsForm projectId={projectId} project={project} onClose={onClose} />
            : <div style={{ color: '#5a6370', fontSize: 12 }}>Loading…</div>
          }
        </div>
      </aside>
    </>
  )
}

function SettingsForm({ projectId, project, onClose }: { projectId: string; project: Project; onClose: () => void }) {
  const mutation = useUpdateSettings()
  const [ideasDir, setIdeasDir] = useState(project.ideas_dir ?? '')
  const [specsDir, setSpecsDir] = useState(project.specs_dir ?? '')
  const [plansDir, setPlansDir] = useState(project.plans_dir ?? '')
  const [saveError, setSaveError] = useState<string | null>(null)

  const toNullable = (v: string): string | null => v.trim() === '' ? null : v.trim()

  async function handleSave() {
    setSaveError(null)
    try {
      await mutation.mutateAsync({
        id: projectId,
        settings: {
          ideas_dir: toNullable(ideasDir),
          specs_dir: toNullable(specsDir),
          plans_dir: toNullable(plansDir),
        },
      })
      onClose()
    } catch {
      setSaveError('Failed to save settings.')
    }
  }

  const fields = [
    { label: 'Ideas directory', placeholder: 'docs/superpowers/ideas', value: ideasDir, onChange: setIdeasDir },
    { label: 'Specs directory', placeholder: 'docs/superpowers/specs', value: specsDir, onChange: setSpecsDir },
    { label: 'Plans directory', placeholder: 'docs/superpowers/plans', value: plansDir, onChange: setPlansDir },
  ]

  return (
    <>
      {fields.map(({ label, placeholder, value, onChange }) => (
        <div key={label} style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', color: '#8a9199', fontSize: 12, marginBottom: 6 }}>{label}</label>
          <input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            style={{
              width: '100%', background: '#0d0e10', border: '1px solid #1e2124',
              borderRadius: 6, padding: '7px 10px', color: '#e2e6ea', fontSize: 13,
              boxSizing: 'border-box', fontFamily: 'inherit',
            }}
          />
        </div>
      ))}

      <button
        onClick={handleSave}
        disabled={mutation.isPending}
        style={{
          background: '#1c2028', color: mutation.isPending ? '#5a6370' : '#c8ced6',
          border: '1px solid #2e3338', borderRadius: 6, padding: '7px 16px',
          fontSize: 13, cursor: mutation.isPending ? 'default' : 'pointer',
          marginTop: 4, fontFamily: 'inherit',
        }}
      >
        {mutation.isPending ? 'Saving…' : 'Save'}
      </button>
      {saveError && (
        <div style={{ color: '#c04040', fontSize: 12, marginTop: 8 }}>{saveError}</div>
      )}

      <div style={{ borderTop: '1px solid #1e2124', marginTop: 24, paddingTop: 20 }}>
        {[
          { label: 'Project name', value: project.name },
          { label: 'Root path', value: project.path },
        ].map(({ label, value }) => (
          <div key={label} style={{ marginBottom: 14 }}>
            <div style={{ color: '#5a6370', fontSize: 11, marginBottom: 3 }}>{label}</div>
            <div style={{ color: '#8a9199', fontSize: 12 }}>{value}</div>
          </div>
        ))}
        <div style={{ color: '#2e3338', fontSize: 11, marginTop: 12 }}>
          To rename or move a project, update it directly in the database.
        </div>
      </div>
    </>
  )
}
