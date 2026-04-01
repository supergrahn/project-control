'use client'
import { useState, useEffect } from 'react'
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
}

type TaskSourceConfig = {
  project_id: string
  adapter_key: string
  config: Record<string, string>
  is_active: number
  last_synced_at: string | null
  last_error: string | null
  created_at: string
}

export default function TaskSourceSettings({ projectId }: { projectId: string }) {
  const [adapters, setAdapters] = useState<AdapterInfo[]>([])
  const [config, setConfig] = useState<TaskSourceConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ created: number; updated: number; deleted: number } | null>(null)
  const [selectedAdapter, setSelectedAdapter] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [deleteTasksOnRemove, setDeleteTasksOnRemove] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/task-sources').then(r => r.json()),
      fetch(`/api/projects/${projectId}/task-source`).then(r => r.ok ? r.json() : null),
    ]).then(([adaptersData, configData]) => {
      setAdapters(adaptersData)
      setConfig(configData)
      setLoading(false)
    })
  }, [projectId])

  async function handleSave(values: Record<string, string>) {
    setSaving(true)
    setError(null)
    try {
      const adapterKey = selectedAdapter || config?.adapter_key
      const res = await fetch(`/api/projects/${projectId}/task-source`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adapterKey, config: values }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to save')
        return
      }
      // Refresh config
      const newConfig = await fetch(`/api/projects/${projectId}/task-source`).then(r => r.json())
      setConfig(newConfig)
      setEditing(false)
      setSelectedAdapter(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/sync-tasks`, { method: 'POST' })
      const result = await res.json()
      setSyncResult(result)
      // Refresh config to get updated last_synced_at
      const newConfig = await fetch(`/api/projects/${projectId}/task-source`).then(r => r.json())
      setConfig(newConfig)
    } finally {
      setSyncing(false)
    }
  }

  async function handleToggle() {
    if (!config) return
    const newActive = config.is_active ? false : true
    await fetch(`/api/projects/${projectId}/task-source`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: newActive }),
    })
    setConfig({ ...config, is_active: newActive ? 1 : 0 })
  }

  async function handleRemove() {
    const qs = deleteTasksOnRemove ? '?deleteTasks=true' : ''
    await fetch(`/api/projects/${projectId}/task-source${qs}`, { method: 'DELETE' })
    setConfig(null)
    setShowRemoveConfirm(false)
    setSelectedAdapter(null)
  }

  if (loading) return <div className="text-text-muted text-[13px]">Loading...</div>

  // State: No source configured — show service picker
  if (!config && !selectedAdapter) {
    return (
      <div>
        <div className="text-text-secondary text-[13px] font-semibold mb-3">External Task Source</div>
        <div className="text-text-muted text-[12px] mb-4">
          Connect an external task tracker to sync tasks automatically.
        </div>
        <div className="flex gap-2 flex-wrap">
          {adapters.map(a => (
            <button
              key={a.key}
              onClick={() => setSelectedAdapter(a.key)}
              className="bg-bg-secondary text-text-secondary border border-border-default rounded-[6px] px-4 py-2 text-[13px] cursor-pointer"
            >
              {a.name}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // State: Service selected, show config form
  if (!config || editing) {
    const adapterKey = selectedAdapter || config?.adapter_key
    const adapter = adapters.find(a => a.key === adapterKey)
    if (!adapter) return null

    return (
      <div>
        <div className="text-text-secondary text-[13px] font-semibold mb-3">
          Configure {adapter.name}
        </div>
        {error && (
          <div className="text-status-error text-[12px] mb-3 px-3 py-2 bg-border-default rounded-[6px]">
            {error}
          </div>
        )}
        <DynamicConfigForm
          fields={adapter.configFields}
          values={config?.config || {}}
          onSubmit={handleSave}
          loading={saving}
        />
        <button
          onClick={() => { setSelectedAdapter(null); setEditing(false) }}
          className="bg-none border-none text-text-muted cursor-pointer text-[12px] mt-3 p-0"
        >
          Cancel
        </button>
      </div>
    )
  }

  // State: Source configured — show status and controls
  const adapter = adapters.find(a => a.key === config.adapter_key)

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-text-secondary text-[13px] font-semibold">
          {adapter?.name || config.adapter_key}
        </span>
        <span className={`text-[11px] px-2 py-0.5 rounded-[4px] ${
          config.is_active
            ? 'bg-accent-green/15 text-status-success'
            : 'bg-accent-orange/15 text-status-warning'
        }`}>
          {config.is_active ? 'Active' : 'Paused'}
        </span>
        {config.last_error && (
          <span className="text-[11px] px-2 py-0.5 rounded-[4px] bg-accent-red/15 text-status-error">
            Error
          </span>
        )}
      </div>

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

      <div className="flex gap-2 flex-wrap mb-3">
        <button onClick={handleSync} disabled={syncing} className="bg-accent-blue/15 text-accent-blue border border-accent-blue/15 rounded-[6px] px-3.5 py-1.5 text-[12px] cursor-pointer disabled:cursor-not-allowed">
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
        <button onClick={handleToggle} className="bg-bg-secondary text-text-secondary border border-border-default rounded-[6px] px-3.5 py-1.5 text-[12px] cursor-pointer">
          {config.is_active ? 'Pause' : 'Resume'}
        </button>
        <button onClick={() => setEditing(true)} className="bg-bg-secondary text-text-secondary border border-border-default rounded-[6px] px-3.5 py-1.5 text-[12px] cursor-pointer">
          Edit Configuration
        </button>
        <button onClick={() => setShowRemoveConfirm(true)} className="bg-bg-secondary text-status-error border border-border-default rounded-[6px] px-3.5 py-1.5 text-[12px] cursor-pointer">
          Remove
        </button>
      </div>

      {showRemoveConfirm && (
        <div className="p-4 bg-border-default rounded-[6px] mt-2">
          <div className="text-text-primary text-[13px] mb-3">Remove this task source?</div>
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
    </div>
  )
}
