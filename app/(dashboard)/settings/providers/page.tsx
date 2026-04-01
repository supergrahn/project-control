'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Provider, ProviderType } from '@/lib/db/providers'

const TYPE_LABELS: Record<ProviderType, string> = {
  claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini CLI', ollama: 'Ollama',
}

const TYPE_PLACEHOLDER: Record<ProviderType, string> = {
  claude: '~/.local/bin/claude', codex: 'codex', gemini: 'gemini', ollama: 'ollama',
}

const TYPE_COLOR: Record<ProviderType, string> = {
  claude: '#6b4f9e', codex: '#2e6fa3', gemini: '#3a7d44', ollama: '#7d5a2e',
}

function ConfigFields({ type, config, onChange }: {
  type: ProviderType
  config: Record<string, unknown>
  onChange: (c: Record<string, unknown>) => void
}) {
  if (type === 'ollama') {
    return (
      <div className="flex flex-col gap-2.5">
        <div>
          <label className="block text-text-secondary text-xs mb-1">Host</label>
          <input value={(config.host as string) ?? ''} onChange={e => onChange({ ...config, host: e.target.value })}
            placeholder="http://localhost:11434" className="w-full bg-bg-primary border border-border-subtle rounded px-2.5 py-1.5 text-sm text-text-primary outline-none" />
        </div>
        <div>
          <label className="block text-text-secondary text-xs mb-1">Model</label>
          <input value={(config.model as string) ?? ''} onChange={e => onChange({ ...config, model: e.target.value })}
            placeholder="qwen2.5-coder" className="w-full bg-bg-primary border border-border-subtle rounded px-2.5 py-1.5 text-sm text-text-primary outline-none" />
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <label className="block text-text-secondary text-xs mb-1">Model</label>
        <input value={(config.model as string) ?? ''} onChange={e => onChange({ ...config, model: e.target.value })}
          placeholder={type === 'claude' ? 'claude-sonnet-4-6' : type === 'gemini' ? 'gemini-2.5-pro' : 'codex-mini'}
          className="w-full bg-bg-primary border border-border-subtle rounded px-2.5 py-1.5 text-sm text-text-primary outline-none" />
      </div>
      <div>
        <label className="block text-text-secondary text-xs mb-1">
          Extra flags <span className="text-text-muted">(space-separated)</span>
        </label>
        <input
          value={((config.flags as string[]) ?? []).join(' ')}
          onChange={e => onChange({ ...config, flags: e.target.value.trim() ? e.target.value.trim().split(/\s+/) : [] })}
          placeholder="--permission-mode bypassPermissions"
          className="w-full bg-bg-primary border border-border-subtle rounded px-2.5 py-1.5 text-sm text-text-primary outline-none"
        />
      </div>
    </div>
  )
}

export default function ProvidersPage() {
  const qc = useQueryClient()
  const { data: providers = [], isLoading, isError } = useQuery<Provider[]>({
    queryKey: ['providers'],
    queryFn: () => fetch('/api/providers').then(async r => { if (!r.ok) throw new Error('Failed to load providers'); return r.json() }),
  })

  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState<ProviderType>('claude')
  const [formCommand, setFormCommand] = useState('')
  const [formConfig, setFormConfig] = useState<Record<string, unknown>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, 'pending' | 'pass' | 'fail'>>({})

  const createMutation = useMutation({
    mutationFn: (data: object) =>
      fetch('/api/providers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? 'Failed') } return r.json() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['providers'] })
      setShowForm(false); setFormName(''); setFormType('claude'); setFormCommand(''); setFormConfig({}); setFormError(null)
    },
    onError: (e: Error) => setFormError(e.message),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/providers/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toggle_active: true }) })
        .then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? 'Toggle failed') } return r.json() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/providers/${id}`, { method: 'DELETE' })
        .then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? 'Delete failed') } return r.json() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }),
  })

  async function handleTest(provider: Provider) {
    setTestResults(r => ({ ...r, [provider.id]: 'pending' }))
    try {
      const res = await fetch(`/api/providers/${provider.id}/test`, { method: 'POST' })
      setTestResults(r => ({ ...r, [provider.id]: res.ok ? 'pass' : 'fail' }))
    } catch {
      setTestResults(r => ({ ...r, [provider.id]: 'fail' }))
    }
  }

  function handleSubmit() {
    if (!formName.trim()) { setFormError('Name is required'); return }
    if (!formCommand.trim()) { setFormError('Command is required'); return }
    setFormError(null)
    createMutation.mutate({ name: formName.trim(), type: formType, command: formCommand.trim(), config: JSON.stringify(formConfig) })
  }

  return (
    <div className="max-w-2xl font-sans">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-text-primary text-base font-semibold m-0">Providers</h2>
          <p className="text-text-secondary text-sm mt-1">Configure AI provider binaries for session spawning.</p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="bg-accent-blue text-white border-none rounded px-3.5 py-1.5 text-sm cursor-pointer font-medium hover:opacity-80">
          {showForm ? 'Cancel' : '+ Add Provider'}
        </button>
      </div>

      {showForm && (
        <div className="bg-bg-secondary border border-border-subtle rounded-lg p-5 mb-6">
          <h3 className="text-text-primary text-sm font-semibold m-0 mb-4">New Provider</h3>
          <div className="flex flex-col gap-3.5">
            <div>
              <label className="block text-text-secondary text-xs mb-1">Name</label>
              <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="My Claude" className="w-full bg-bg-primary border border-border-subtle rounded px-2.5 py-1.5 text-sm text-text-primary outline-none" />
            </div>
            <div>
              <label className="block text-text-secondary text-xs mb-1">Type</label>
              <select value={formType} onChange={e => { setFormType(e.target.value as ProviderType); setFormConfig({}) }}
                className="w-full bg-bg-primary border border-border-subtle rounded px-2.5 py-1.5 text-sm text-text-primary outline-none">
                {(Object.keys(TYPE_LABELS) as ProviderType[]).map(t => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-text-secondary text-xs mb-1">Command</label>
              <input value={formCommand} onChange={e => setFormCommand(e.target.value)}
                placeholder={TYPE_PLACEHOLDER[formType]} className="w-full bg-bg-primary border border-border-subtle rounded px-2.5 py-1.5 text-sm text-text-primary outline-none" />
            </div>
            <div>
              <label className="block text-text-secondary text-xs mb-2">Config</label>
              <ConfigFields type={formType} config={formConfig} onChange={setFormConfig} />
            </div>
            {formError && <div className="text-status-error text-xs">{formError}</div>}
            <button onClick={handleSubmit} disabled={createMutation.isPending}
              className="bg-accent-blue text-white border-none rounded px-4 py-1.5 text-sm cursor-pointer font-medium self-start hover:opacity-80 disabled:opacity-60">
              {createMutation.isPending ? 'Saving…' : 'Save Provider'}
            </button>
          </div>
        </div>
      )}

      {isError ? (
        <div className="text-status-error text-sm">Failed to load providers.</div>
      ) : isLoading ? (
        <div className="text-text-secondary text-sm">Loading…</div>
      ) : providers.length === 0 ? (
        <div className="text-text-muted text-sm py-8 text-center">No providers configured. Add one above.</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {providers.map(p => {
            const testResult = testResults[p.id]
            return (
              <div key={p.id} className={`bg-bg-secondary border border-border-subtle rounded-lg p-3.5 flex items-center gap-3 ${p.is_active === 0 ? 'opacity-55' : ''}`}>
                <span className="rounded px-1.75 py-0.5 text-xs font-semibold text-white flex-shrink-0" style={{ background: TYPE_COLOR[p.type] }}>
                  {TYPE_LABELS[p.type]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-text-primary text-sm font-medium mb-0.5">{p.name}</div>
                  <div className="text-text-secondary text-xs font-mono overflow-hidden text-ellipsis whitespace-nowrap">{p.command}</div>
                </div>
                {testResult && (
                  <span className={`text-xs flex-shrink-0 ${testResult === 'pass' ? 'text-status-success' : testResult === 'fail' ? 'text-status-error' : 'text-text-secondary'}`}>
                    {testResult === 'pending' ? 'Testing…' : testResult === 'pass' ? 'OK' : 'Failed'}
                  </span>
                )}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => handleTest(p)} disabled={testResult === 'pending'}
                    className="bg-transparent border border-border-subtle rounded px-2.5 py-1 text-text-secondary text-xs cursor-pointer hover:bg-bg-tertiary disabled:opacity-50">
                    Test
                  </button>
                  <button onClick={() => toggleMutation.mutate(p.id)}
                    title={p.is_active === 1 ? 'Disable' : 'Enable'}
                    aria-label={p.is_active === 1 ? 'Disable provider' : 'Enable provider'}
                    aria-pressed={p.is_active === 1}
                    className={`w-9 h-5 rounded-full border-none cursor-pointer relative flex-shrink-0 transition-colors ${p.is_active === 1 ? 'bg-accent-blue' : 'bg-border-subtle'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${p.is_active === 1 ? 'left-4.5' : 'left-0.5'}`} />
                  </button>
                  <button onClick={() => { if (confirm(`Delete "${p.name}"?`)) deleteMutation.mutate(p.id) }}
                    className="bg-transparent border border-border-subtle rounded px-2.5 py-1 text-status-error text-xs cursor-pointer hover:bg-bg-tertiary">
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
