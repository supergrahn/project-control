'use client'
import { useState, useEffect, useRef } from 'react'
import { useProjectStore, useUpdateSettings } from '@/hooks/useProjects'
import { useGlobalSettings, useUpdateGlobalSettings } from '@/hooks/useGlobalSettings'

export default function SettingsPage() {
  const { selectedProject } = useProjectStore()
  const updateSettings = useUpdateSettings()
  const { data: globalSettings } = useGlobalSettings()
  const updateGlobal = useUpdateGlobalSettings()

  const [projectForm, setProjectForm] = useState({ ideas_dir: '', specs_dir: '', plans_dir: '' })
  const [globalForm, setGlobalForm] = useState({ git_root: '' })
  const [projectSaved, setProjectSaved] = useState(false)
  const [projectSaveError, setProjectSaveError] = useState<string | null>(null)
  const [globalSaved, setGlobalSaved] = useState(false)
  const [globalSaveError, setGlobalSaveError] = useState<string | null>(null)

  // Only initialise the form from remote data once (first load / project switch).
  // Never reset the "Saved" flag here — that would wipe the confirmation the
  // instant the query refetches after a successful save.
  const globalSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const projectSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (globalSettings) {
      setGlobalForm({ git_root: globalSettings.git_root ?? '' })
    }
  }, [globalSettings])

  useEffect(() => {
    if (selectedProject) {
      const noneSet = !selectedProject.ideas_dir && !selectedProject.specs_dir && !selectedProject.plans_dir
      setProjectForm({
        ideas_dir: selectedProject.ideas_dir ?? (noneSet ? 'docs/ideas' : ''),
        specs_dir: selectedProject.specs_dir ?? (noneSet ? 'docs/specs' : ''),
        plans_dir: selectedProject.plans_dir ?? (noneSet ? 'docs/plans' : ''),
      })
      setProjectSaved(false)
    }
  }, [selectedProject?.id])

  return (
    <div className="max-w-lg space-y-10">
      {/* Global settings — always visible */}
      <section>
        <h2 className="text-base font-semibold text-text-primary mb-1">Global</h2>
        <p className="text-xs text-text-secondary mb-4">Applies to all projects</p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">
              Git projects folder{' '}
              <span className="text-text-muted">(folder to scan for projects)</span>
            </label>
            <input
              value={globalForm.git_root}
              onChange={(e) => setGlobalForm({ git_root: e.target.value })}
              placeholder="~/git"
              className="w-full bg-bg-primary border border-border-default rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-blue"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                setGlobalSaveError(null)
                try {
                  await updateGlobal.mutateAsync({
                    git_root: globalForm.git_root.trim() || null,
                  })
                  setGlobalSaved(true)
                  if (globalSavedTimerRef.current) clearTimeout(globalSavedTimerRef.current)
                  globalSavedTimerRef.current = setTimeout(() => setGlobalSaved(false), 3000)
                } catch {
                  setGlobalSaveError('Failed to save. Please try again.')
                }
              }}
              disabled={updateGlobal.isPending}
              className="px-4 py-2 bg-accent-blue hover:opacity-80 text-white text-sm rounded disabled:opacity-50"
            >
              {updateGlobal.isPending ? 'Saving...' : 'Save'}
            </button>
            {globalSaved && <span className="text-xs text-status-success">Saved</span>}
            {globalSaveError && <span className="text-xs text-status-error">{globalSaveError}</span>}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="border-t border-border-default" />

      {/* Project settings */}
      <section>
        <h2 className="text-base font-semibold text-text-primary mb-1">
          {selectedProject ? `Project — ${selectedProject.name}` : 'Project'}
        </h2>
        <p className="text-xs text-text-secondary mb-4">
          {selectedProject
            ? 'Configure folder paths for this project'
            : 'Select a project from the top bar to configure project settings'}
        </p>

        {selectedProject ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setProjectForm({ ideas_dir: 'docs/ideas', specs_dir: 'docs/specs', plans_dir: 'docs/plans' })}
              className="text-xs text-text-secondary hover:text-text-primary underline"
            >
              Use defaults (docs/ideas, docs/specs, docs/plans)
            </button>
            {(['ideas_dir', 'specs_dir', 'plans_dir'] as const).map((field) => (
              <div key={field}>
                <label className="block text-xs text-text-secondary mb-1.5 capitalize">
                  {field.replace('_dir', '')} folder{' '}
                  <span className="text-text-muted">(relative to project root)</span>
                </label>
                <input
                  value={projectForm[field]}
                  onChange={(e) => { setProjectForm((f) => ({ ...f, [field]: e.target.value })); setProjectSaved(false) }}
                  placeholder={`e.g. docs/${field.replace('_dir', '')}`}
                  className="w-full bg-bg-primary border border-border-default rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-blue"
                />
              </div>
            ))}
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  setProjectSaveError(null)
                  try {
                    const settings: Record<string, string | null> = {}
                    for (const [key, val] of Object.entries(projectForm)) {
                      settings[key] = val.trim() || null
                    }
                    await updateSettings.mutateAsync({ id: selectedProject.id, settings })
                    setProjectSaved(true)
                    if (projectSavedTimerRef.current) clearTimeout(projectSavedTimerRef.current)
                    projectSavedTimerRef.current = setTimeout(() => setProjectSaved(false), 3000)
                  } catch {
                    setProjectSaveError('Failed to save settings. Please try again.')
                  }
                }}
                disabled={updateSettings.isPending}
                className="px-4 py-2 bg-accent-blue hover:opacity-80 text-white text-sm rounded disabled:opacity-50"
              >
                {updateSettings.isPending ? 'Saving...' : 'Save Settings'}
              </button>
              {projectSaved && <span className="text-xs text-status-success">Saved</span>}
              {projectSaveError && <span className="text-xs text-status-error">{projectSaveError}</span>}
            </div>
            <p className="text-xs text-text-muted">Project path: {selectedProject.path}</p>
          </div>
        ) : null}
      </section>
    </div>
  )
}
