'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

type ProviderType = 'claude' | 'codex' | 'gemini' | 'ollama'

type Provider = {
  id: string; name: string; type: ProviderType; command: string
  config: string | null; is_active: number; created_at: string
}

const TYPE_LABELS: Record<ProviderType, string> = {
  claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini CLI', ollama: 'Ollama',
}

const TYPE_PLACEHOLDER: Record<ProviderType, string> = {
  claude: '~/.local/bin/claude', codex: 'codex', gemini: 'gemini', ollama: 'ollama',
}

const TYPE_COLOR: Record<ProviderType, string> = {
  claude: '#6b4f9e', codex: '#2e6fa3', gemini: '#3a7d44', ollama: '#7d5a2e',
}

const S = {
  bg: '#0d0e10', surface: '#141618', border: '#1e2124',
  muted: '#8a9199', primary: '#5b9bd5', danger: '#c04040',
  text: '#d4d9de', dim: '#5a6370',
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: S.bg, border: `1px solid ${S.border}`, borderRadius: 4,
  padding: '6px 10px', color: S.text, fontSize: 13, boxSizing: 'border-box',
}

function ConfigFields({ type, config, onChange }: {
  type: ProviderType
  config: Record<string, unknown>
  onChange: (c: Record<string, unknown>) => void
}) {
  if (type === 'ollama') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={{ display: 'block', color: S.muted, fontSize: 12, marginBottom: 4 }}>Host</label>
          <input value={(config.host as string) ?? ''} onChange={e => onChange({ ...config, host: e.target.value })}
            placeholder="http://localhost:11434" style={inputStyle} />
        </div>
        <div>
          <label style={{ display: 'block', color: S.muted, fontSize: 12, marginBottom: 4 }}>Model</label>
          <input value={(config.model as string) ?? ''} onChange={e => onChange({ ...config, model: e.target.value })}
            placeholder="qwen2.5-coder" style={inputStyle} />
        </div>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <label style={{ display: 'block', color: S.muted, fontSize: 12, marginBottom: 4 }}>Model</label>
        <input value={(config.model as string) ?? ''} onChange={e => onChange({ ...config, model: e.target.value })}
          placeholder={type === 'claude' ? 'claude-sonnet-4-6' : type === 'gemini' ? 'gemini-2.5-pro' : 'codex-mini'}
          style={inputStyle} />
      </div>
      <div>
        <label style={{ display: 'block', color: S.muted, fontSize: 12, marginBottom: 4 }}>
          Extra flags <span style={{ color: S.dim }}>(space-separated)</span>
        </label>
        <input
          value={((config.flags as string[]) ?? []).join(' ')}
          onChange={e => onChange({ ...config, flags: e.target.value.trim() ? e.target.value.trim().split(/\s+/) : [] })}
          placeholder="--permission-mode bypassPermissions"
          style={inputStyle}
        />
      </div>
    </div>
  )
}

export default function ProvidersPage() {
  const qc = useQueryClient()
  const { data: providers = [], isLoading } = useQuery<Provider[]>({
    queryKey: ['providers'],
    queryFn: () => fetch('/api/providers').then(r => r.json()),
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
      fetch(`/api/providers/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toggle_active: true }) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/providers/${id}`, { method: 'DELETE' }).then(r => r.json()),
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
    <div style={{ maxWidth: 700, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ color: S.text, fontSize: 16, fontWeight: 600, margin: 0 }}>Providers</h2>
          <p style={{ color: S.muted, fontSize: 13, margin: '4px 0 0' }}>Configure AI provider binaries for session spawning.</p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          style={{ background: S.primary, color: '#fff', border: 'none', borderRadius: 5, padding: '7px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
          {showForm ? 'Cancel' : '+ Add Provider'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 8, padding: 20, marginBottom: 24 }}>
          <h3 style={{ color: S.text, fontSize: 14, fontWeight: 600, margin: '0 0 16px' }}>New Provider</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', color: S.muted, fontSize: 12, marginBottom: 4 }}>Name</label>
              <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="My Claude" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', color: S.muted, fontSize: 12, marginBottom: 4 }}>Type</label>
              <select value={formType} onChange={e => { setFormType(e.target.value as ProviderType); setFormConfig({}) }}
                style={{ ...inputStyle }}>
                {(Object.keys(TYPE_LABELS) as ProviderType[]).map(t => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', color: S.muted, fontSize: 12, marginBottom: 4 }}>Command</label>
              <input value={formCommand} onChange={e => setFormCommand(e.target.value)}
                placeholder={TYPE_PLACEHOLDER[formType]} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', color: S.muted, fontSize: 12, marginBottom: 8 }}>Config</label>
              <ConfigFields type={formType} config={formConfig} onChange={setFormConfig} />
            </div>
            {formError && <div style={{ color: S.danger, fontSize: 12 }}>{formError}</div>}
            <button onClick={handleSubmit} disabled={createMutation.isPending}
              style={{ background: S.primary, color: '#fff', border: 'none', borderRadius: 5, padding: '7px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 500, alignSelf: 'flex-start', opacity: createMutation.isPending ? 0.6 : 1 }}>
              {createMutation.isPending ? 'Saving…' : 'Save Provider'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div style={{ color: S.muted, fontSize: 13 }}>Loading…</div>
      ) : providers.length === 0 ? (
        <div style={{ color: S.dim, fontSize: 14, padding: '32px 0', textAlign: 'center' }}>No providers configured. Add one above.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {providers.map(p => {
            const testResult = testResults[p.id]
            return (
              <div key={p.id} style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 8, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, opacity: p.is_active === 0 ? 0.55 : 1 }}>
                <span style={{ background: TYPE_COLOR[p.type], color: '#fff', borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                  {TYPE_LABELS[p.type]}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: S.text, fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{p.name}</div>
                  <div style={{ color: S.muted, fontSize: 12, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.command}</div>
                </div>
                {testResult && (
                  <span style={{ fontSize: 12, flexShrink: 0, color: testResult === 'pass' ? '#3a8c5c' : testResult === 'fail' ? S.danger : S.muted }}>
                    {testResult === 'pending' ? 'Testing…' : testResult === 'pass' ? 'OK' : 'Failed'}
                  </span>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => handleTest(p)} disabled={testResult === 'pending'}
                    style={{ background: 'transparent', border: `1px solid ${S.border}`, borderRadius: 4, padding: '4px 10px', color: S.muted, fontSize: 12, cursor: 'pointer' }}>
                    Test
                  </button>
                  <button onClick={() => toggleMutation.mutate(p.id)}
                    title={p.is_active === 1 ? 'Disable' : 'Enable'}
                    style={{ width: 36, height: 20, borderRadius: 10, background: p.is_active === 1 ? S.primary : S.border, border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                    <span style={{ position: 'absolute', top: 2, left: p.is_active === 1 ? 18 : 2, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'left 0.15s' }} />
                  </button>
                  <button onClick={() => { if (confirm(`Delete "${p.name}"?`)) deleteMutation.mutate(p.id) }}
                    style={{ background: 'transparent', border: `1px solid ${S.border}`, borderRadius: 4, padding: '4px 10px', color: S.danger, fontSize: 12, cursor: 'pointer' }}>
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
