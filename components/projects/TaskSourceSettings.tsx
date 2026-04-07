'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import DynamicConfigForm from './DynamicConfigForm'

type ConfigField = {
  key: string
  label: string
  type: 'text' | 'password' | 'textarea'
  placeholder?: string
  required: boolean
  helpText?: string
}

type AdapterInfo = {
  key: string
  name: string
  configFields: ConfigField[]
  resourceSelectionLabel: string
}

type TaskSourceConfig = {
  id: number
  project_id: string
  adapter_key: string
  config: Record<string, string>
  resource_ids: string[]
  is_active: boolean
  last_synced_at: string | null
  last_error: string | null
}

type Resource = { id: string; name: string }

type AdapterCardProps = {
  projectId: string
  adapter: AdapterInfo
  config: TaskSourceConfig | null
  onSaved: () => void
}

function AdapterCard({ projectId, adapter, config, onSaved }: AdapterCardProps) {
  const [expanded, setExpanded] = useState(!!config)
  const [editing, setEditing] = useState(!config)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ created: number; updated: number; deleted: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [deleteTasksOnRemove, setDeleteTasksOnRemove] = useState(false)

  const [resources, setResources] = useState<Resource[]>([])
  const [loadingResources, setLoadingResources] = useState(false)
  const [resourceError, setResourceError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>(config?.resource_ids ?? [])

  const fetchResources = useCallback(async (formValues: Record<string, string>) => {
    // Allow '••••••••' — the server substitutes stored real credentials
    const hasRequired = adapter.configFields
      .filter(f => f.required)
      .every(f => !!formValues[f.key])
    if (!hasRequired) return

    setLoadingResources(true)
    setResourceError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/task-source/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adapterKey: adapter.key, config: formValues }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResourceError(data.error ?? 'Failed to fetch resources')
      } else {
        setResources(data.resources)
      }
    } catch {
      setResourceError('Failed to fetch resources')
    } finally {
      setLoadingResources(false)
    }
  }, [adapter, projectId])

  // Auto-fetch resources when entering edit mode with a saved config
  const editingRef = useRef(editing)
  useEffect(() => {
    const wasEditing = editingRef.current
    editingRef.current = editing
    if (editing && !wasEditing && config) {
      fetchResources(config.config)
    }
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleResource(id: string) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function handleSave(values: Record<string, string>) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/task-source`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adapterKey: adapter.key, config: values, resourceIds: selectedIds }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to save')
        return
      }
      setEditing(false)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/sync-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adapterKey: adapter.key }),
      })
      setSyncResult(await res.json())
      onSaved()
    } finally {
      setSyncing(false)
    }
  }

  async function handleToggle() {
    if (!config) return
    await fetch(`/api/projects/${projectId}/task-source`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adapterKey: adapter.key, is_active: !config.is_active }),
    })
    onSaved()
  }

  async function handleRemove() {
    const qs = `?adapterKey=${adapter.key}${deleteTasksOnRemove ? '&deleteTasks=true' : ''}`
    await fetch(`/api/projects/${projectId}/task-source${qs}`, { method: 'DELETE' })
    setShowRemoveConfirm(false)
    setExpanded(false)
    setEditing(false)
    onSaved()
  }

  if (!expanded) {
    return (
      <div className="flex items-center justify-between py-2">
        <span className="text-text-secondary text-[13px]">{adapter.name}</span>
        <button
          onClick={() => { setExpanded(true); setEditing(true) }}
          className="text-accent-blue text-[12px] cursor-pointer bg-none border-none p-0"
        >
          Set up
        </button>
      </div>
    )
  }

  return (
    <div className="py-3 border-t border-border-default first:border-0">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-text-secondary text-[13px] font-semibold">{adapter.name}</span>
        {config && (
          <span className={`text-[11px] px-2 py-0.5 rounded-[4px] ${
            config.is_active
              ? 'bg-accent-green/15 text-status-success'
              : 'bg-accent-orange/15 text-status-warning'
          }`}>
            {config.is_active ? 'Active' : 'Paused'}
          </span>
        )}
        {config?.last_error && (
          <span className="text-[11px] px-2 py-0.5 rounded-[4px] bg-accent-red/15 text-status-error">Error</span>
        )}
        {!config && (
          <button
            onClick={() => { setExpanded(false); setEditing(false) }}
            className="ml-auto text-text-muted text-[12px] cursor-pointer bg-none border-none p-0"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Config form (editing mode) */}
      {(editing || !config) && (
        <>
          {error && (
            <div className="text-status-error text-[12px] mb-3 px-3 py-2 bg-border-default rounded-[6px]">
              {error}
            </div>
          )}
          <DynamicConfigForm
            fields={adapter.configFields}
            values={config?.config ?? {}}
            onSubmit={handleSave}
            onFieldBlur={fetchResources}
            loading={saving}
          />

          {/* Resource picker */}
          {(resources.length > 0 || loadingResources || resourceError) && (
            <div className="mt-4">
              <div className="text-text-secondary text-[12px] font-semibold mb-2">
                {adapter.resourceSelectionLabel}
              </div>
              {loadingResources && (
                <div className="text-text-muted text-[12px]">Loading...</div>
              )}
              {resourceError && (
                <div className="text-status-error text-[12px]">{resourceError}</div>
              )}
              {!loadingResources && resources.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {resources.map(r => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleResource(r.id)}
                      className={`px-2.5 py-1 rounded-[4px] text-[12px] border cursor-pointer transition-colors ${
                        selectedIds.includes(r.id)
                          ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                          : 'bg-bg-secondary text-text-secondary border-border-default'
                      }`}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {config && (
            <button
              onClick={() => setEditing(false)}
              className="bg-none border-none text-text-muted cursor-pointer text-[12px] mt-3 p-0"
            >
              Cancel
            </button>
          )}
        </>
      )}

      {/* Configured view (not editing) */}
      {config && !editing && (
        <>
          {config.last_synced_at && (
            <div className="text-text-muted text-[12px] mb-2">
              Last synced: {new Date(config.last_synced_at).toLocaleString()}
            </div>
          )}
          {config.last_error && (
            <div className="text-status-warning text-[12px] mb-3 px-3 py-2 bg-border-default rounded-[6px]">
              {config.last_error}
            </div>
          )}
          {syncResult && (
            <div className="text-status-success text-[12px] mb-3">
              Synced: {syncResult.created} created, {syncResult.updated} updated, {syncResult.deleted} deleted
            </div>
          )}

          {/* Selected resources display */}
          {config.resource_ids.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {config.resource_ids.map(id => (
                <span key={id} className="px-2.5 py-1 rounded-[4px] text-[12px] bg-accent-blue/15 text-accent-blue border border-accent-blue/30">
                  {id}
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2 flex-wrap mb-3">
            <button onClick={handleSync} disabled={syncing} className="bg-accent-blue/15 text-accent-blue border border-accent-blue/15 rounded-[6px] px-3.5 py-1.5 text-[12px] cursor-pointer disabled:cursor-not-allowed">
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <button onClick={handleToggle} className="bg-bg-secondary text-text-secondary border border-border-default rounded-[6px] px-3.5 py-1.5 text-[12px] cursor-pointer">
              {config.is_active ? 'Pause' : 'Resume'}
            </button>
            <button onClick={() => setEditing(true)} className="bg-bg-secondary text-text-secondary border border-border-default rounded-[6px] px-3.5 py-1.5 text-[12px] cursor-pointer">
              Edit
            </button>
            <button onClick={() => setShowRemoveConfirm(true)} className="bg-bg-secondary text-status-error border border-border-default rounded-[6px] px-3.5 py-1.5 text-[12px] cursor-pointer">
              Remove
            </button>
          </div>

          {showRemoveConfirm && (
            <div className="p-4 bg-border-default rounded-[6px] mt-2">
              <div className="text-text-primary text-[13px] mb-3">Remove {adapter.name}?</div>
              <label className="flex items-center gap-2 text-text-secondary text-[12px] mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteTasksOnRemove}
                  onChange={e => setDeleteTasksOnRemove(e.target.checked)}
                />
                Also delete synced tasks
              </label>
              <div className="flex gap-2">
                <button onClick={handleRemove} className="bg-accent-red/15 text-status-error border border-accent-red/15 rounded-[6px] px-3.5 py-1.5 text-[12px] cursor-pointer">
                  Confirm Remove
                </button>
                <button onClick={() => setShowRemoveConfirm(false)} className="bg-bg-secondary text-text-secondary border border-border-default rounded-[6px] px-3.5 py-1.5 text-[12px] cursor-pointer">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function TaskSourceSettings({ projectId }: { projectId: string }) {
  const [adapters, setAdapters] = useState<AdapterInfo[]>([])
  const [configs, setConfigs] = useState<TaskSourceConfig[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const [adaptersData, configsData] = await Promise.all([
      fetch('/api/task-sources').then(r => r.json()),
      fetch(`/api/projects/${projectId}/task-source`).then(r => r.ok ? r.json() : []),
    ])
    setAdapters(adaptersData)
    setConfigs(configsData)
    setLoading(false)
  }

  useEffect(() => { load() }, [projectId])

  if (loading) return <div className="text-text-muted text-[13px]">Loading...</div>

  return (
    <div>
      <div className="text-text-secondary text-[13px] font-semibold mb-3">External Task Sources</div>
      <div className="flex flex-col">
        {adapters.map(adapter => (
          <AdapterCard
            key={adapter.key}
            projectId={projectId}
            adapter={adapter}
            config={configs.find(c => c.adapter_key === adapter.key) ?? null}
            onSaved={load}
          />
        ))}
      </div>
    </div>
  )
}
