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
      fetch(`/api/projects/${projectId}/task-source`).then(r => r.json()),
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

  if (loading) return <div style={{ color: '#5a6370', fontSize: 13 }}>Loading...</div>

  // State: No source configured — show service picker
  if (!config && !selectedAdapter) {
    return (
      <div>
        <div style={{ color: '#8a9199', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>External Task Source</div>
        <div style={{ color: '#5a6370', fontSize: 12, marginBottom: 16 }}>
          Connect an external task tracker to sync tasks automatically.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {adapters.map(a => (
            <button
              key={a.key}
              onClick={() => setSelectedAdapter(a.key)}
              style={{
                background: '#141618',
                color: '#8a9199',
                border: '1px solid #1c1f22',
                borderRadius: 6,
                padding: '8px 16px',
                fontSize: 13,
                cursor: 'pointer',
              }}
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
        <div style={{ color: '#8a9199', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          Configure {adapter.name}
        </div>
        {error && (
          <div style={{ color: '#d94747', fontSize: 12, marginBottom: 12, padding: '8px 12px', background: '#1c1f22', borderRadius: 6 }}>
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
          style={{
            background: 'none', border: 'none', color: '#5a6370', cursor: 'pointer',
            fontSize: 12, marginTop: 12, padding: 0,
          }}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ color: '#8a9199', fontSize: 13, fontWeight: 600 }}>
          {adapter?.name || config.adapter_key}
        </span>
        <span style={{
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: 4,
          background: config.is_active ? '#0d2918' : '#2a2000',
          color: config.is_active ? '#3a8c5c' : '#c9a227',
        }}>
          {config.is_active ? 'Active' : 'Paused'}
        </span>
        {config.last_error && (
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#2a1010', color: '#d94747' }}>
            Error
          </span>
        )}
      </div>

      {config.last_synced_at && (
        <div style={{ color: '#5a6370', fontSize: 12, marginBottom: 8 }}>
          Last synced: {new Date(config.last_synced_at).toLocaleString()}
        </div>
      )}

      {config.last_error && (
        <div style={{ color: '#c9a227', fontSize: 12, marginBottom: 12, padding: '8px 12px', background: '#1c1f22', borderRadius: 6 }}>
          {config.last_error}
        </div>
      )}

      {syncResult && (
        <div style={{ color: '#3a8c5c', fontSize: 12, marginBottom: 12 }}>
          Synced: {syncResult.created} created, {syncResult.updated} updated, {syncResult.deleted} deleted
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={handleSync} disabled={syncing} style={{
          background: '#0d1a2d', color: '#5b9bd5', border: '1px solid #5b9bd522',
          borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: syncing ? 'not-allowed' : 'pointer',
        }}>
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
        <button onClick={handleToggle} style={{
          background: '#141618', color: '#8a9199', border: '1px solid #1c1f22',
          borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
        }}>
          {config.is_active ? 'Pause' : 'Resume'}
        </button>
        <button onClick={() => setEditing(true)} style={{
          background: '#141618', color: '#8a9199', border: '1px solid #1c1f22',
          borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
        }}>
          Edit Configuration
        </button>
        <button onClick={() => setShowRemoveConfirm(true)} style={{
          background: '#141618', color: '#d94747', border: '1px solid #1c1f22',
          borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
        }}>
          Remove
        </button>
      </div>

      {showRemoveConfirm && (
        <div style={{ padding: 16, background: '#1c1f22', borderRadius: 6, marginTop: 8 }}>
          <div style={{ color: '#e2e6ea', fontSize: 13, marginBottom: 12 }}>Remove this task source?</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#8a9199', fontSize: 12, marginBottom: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={deleteTasksOnRemove}
              onChange={e => setDeleteTasksOnRemove(e.target.checked)}
            />
            Also delete synced tasks
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleRemove} style={{
              background: '#2a1010', color: '#d94747', border: '1px solid #d9474722',
              borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
            }}>
              Confirm Remove
            </button>
            <button onClick={() => setShowRemoveConfirm(false)} style={{
              background: '#141618', color: '#8a9199', border: '1px solid #1c1f22',
              borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
