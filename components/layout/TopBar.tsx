'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [gearHovered, setGearHovered] = useState(false)
  const pageLabel = getPageLabel(pathname, projectId)

  return (
    <>
      <div className="h-[38px] bg-bg-base border-b border-border-default px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center">
          <Link
            href={`/projects/${projectId}`}
            className="text-text-muted text-[12px] no-underline"
          >
            {projectName}
          </Link>
          <span className="text-[#2e3338] text-[12px] mx-1.5">›</span>
          <span className="text-text-primary text-[12px] font-medium">{pageLabel}</span>
        </div>
        <button
          onClick={() => setDrawerOpen(true)}
          onMouseEnter={() => setGearHovered(true)}
          onMouseLeave={() => setGearHovered(false)}
          aria-label="Open project settings"
          className={`bg-none border-none cursor-pointer px-1 py-1.5 text-[14px] transition-colors ${
            gearHovered ? 'text-text-secondary' : 'text-text-muted'
          }`}
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
        className="fixed inset-0 z-[199]"
      />
      <aside className="fixed top-0 right-0 bottom-0 w-[420px] bg-bg-secondary border-l border-border-subtle z-[200] flex flex-col font-system">
        <div className="px-5 py-3.5 border-b border-border-subtle flex justify-between items-center">
          <span className="text-text-primary text-[14px] font-bold">Project Settings</span>
          <button onClick={onClose} className="bg-none border-none text-text-muted cursor-pointer text-[18px] leading-none">×</button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">
          {project
            ? <SettingsForm projectId={projectId} project={project} onClose={onClose} />
            : <div className="text-text-muted text-[12px]">Loading…</div>
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
  const [migrating, setMigrating] = useState(false)
  const [migrateResult, setMigrateResult] = useState<{ created: number; skipped: number } | null>(null)

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
        <div key={label} className="mb-4">
          <label className="block text-text-secondary text-[12px] mb-1.5">{label}</label>
          <input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-bg-primary border border-border-subtle rounded px-2.5 py-1.75 text-text-primary text-[13px] box-border"
          />
        </div>
      ))}

      <button
        onClick={handleSave}
        disabled={mutation.isPending}
        className={`bg-[#1c2028] border border-[#2e3338] rounded px-4 py-1.75 text-[13px] mt-1 ${
          mutation.isPending ? 'text-text-muted cursor-default' : 'text-text-primary cursor-pointer'
        }`}
      >
        {mutation.isPending ? 'Saving…' : 'Save'}
      </button>
      {saveError && (
        <div className="text-accent-red text-[12px] mt-2">{saveError}</div>
      )}

      <div className="border-t border-border-subtle mt-6 pt-5">
        <div className="text-text-secondary text-[12px] font-semibold mb-1.5">Task Migration</div>
        <div className="text-text-muted text-[12px] mb-2.5 leading-relaxed">
          Import existing files from the configured directories into the task system. Safe to run multiple times.
        </div>
        <button
          onClick={async () => {
            setMigrating(true)
            setMigrateResult(null)
            try {
              const res = await fetch('/api/migrate/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId }),
              })
              setMigrateResult(await res.json())
            } finally {
              setMigrating(false)
            }
          }}
          disabled={migrating}
          className={`bg-bg-secondary border border-border-default rounded px-3.5 py-1.5 text-[12px] ${
            migrating ? 'text-text-muted cursor-default' : 'text-text-secondary cursor-pointer'
          }`}
        >
          {migrating ? 'Migrating…' : 'Run Migration'}
        </button>
        {migrateResult && (
          <div className="text-accent-green text-[12px] mt-2">
            ✓ Created {migrateResult.created}, skipped {migrateResult.skipped} existing
          </div>
        )}
      </div>

      <div className="border-t border-border-subtle mt-6 pt-5">
        {[
          { label: 'Project name', value: project.name },
          { label: 'Root path', value: project.path },
        ].map(({ label, value }) => (
          <div key={label} className="mb-3.5">
            <div className="text-text-muted text-[11px] mb-0.75">{label}</div>
            <div className="text-text-secondary text-[12px]">{value}</div>
          </div>
        ))}
        <div className="text-[#2e3338] text-[11px] mt-3">
          To rename or move a project, update it directly in the database.
        </div>
      </div>
    </>
  )
}
