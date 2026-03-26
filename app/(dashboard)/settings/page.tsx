'use client'
import { useState, useEffect } from 'react'
import { useProjectStore, useUpdateSettings } from '@/hooks/useProjects'

export default function SettingsPage() {
  const { selectedProject } = useProjectStore()
  const updateSettings = useUpdateSettings()
  const [form, setForm] = useState({ ideas_dir: '', specs_dir: '', plans_dir: '' })
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (selectedProject) {
      setForm({
        ideas_dir: selectedProject.ideas_dir ?? '',
        specs_dir: selectedProject.specs_dir ?? '',
        plans_dir: selectedProject.plans_dir ?? '',
      })
      setSaved(false)
    }
  }, [selectedProject])

  if (!selectedProject) return <p className="text-zinc-500 text-sm">Select a project to configure.</p>

  return (
    <div className="max-w-lg">
      <h1 className="text-lg font-semibold text-zinc-100 mb-6">⚙ Settings — {selectedProject.name}</h1>
      <div className="space-y-4">
        {(['ideas_dir', 'specs_dir', 'plans_dir'] as const).map((field) => (
          <div key={field}>
            <label className="block text-xs text-zinc-400 mb-1.5 capitalize">
              {field.replace('_dir', '')} folder <span className="text-zinc-600">(relative to project root)</span>
            </label>
            <input
              value={form[field]}
              onChange={(e) => { setForm((f) => ({ ...f, [field]: e.target.value })); setSaved(false) }}
              placeholder={`e.g. docs/${field.replace('_dir', '')}`}
              className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500"
            />
          </div>
        ))}
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              setSaveError(null)
              try {
                const settings: Record<string, string | null> = {}
                for (const [key, val] of Object.entries(form)) {
                  settings[key] = val.trim() || null
                }
                await updateSettings.mutateAsync({ id: selectedProject.id, settings })
                setSaved(true)
              } catch {
                setSaveError('Failed to save settings. Please try again.')
              }
            }}
            disabled={updateSettings.isPending}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded disabled:opacity-50"
          >
            {updateSettings.isPending ? 'Saving...' : 'Save Settings'}
          </button>
          {saved && <span className="text-xs text-emerald-400">Saved</span>}
          {saveError && <span className="text-xs text-red-400">{saveError}</span>}
        </div>
      </div>
      <p className="mt-4 text-xs text-zinc-600">Project path: {selectedProject.path}</p>
    </div>
  )
}
