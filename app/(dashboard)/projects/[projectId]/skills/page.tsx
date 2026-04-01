'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import type { Skill } from '@/lib/db/skills'

function generateKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const S = {
  bg: '#0d0e10', surface: '#141618', border: '#1e2124',
  muted: '#8a9199', primary: '#5b9bd5', danger: '#c04040',
  text: '#e2e6ea', dim: '#5a6370',
}

export default function SkillsPage() {
  const { projectId } = useParams() as { projectId: string }
  const [skills, setSkills] = useState<Skill[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedContent, setSelectedContent] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newKey, setNewKey] = useState('')
  const [keyEdited, setKeyEdited] = useState(false)
  const [viewMode, setViewMode] = useState<'view' | 'code'>('view')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const selectedSkill = skills.find(s => s.id === selectedId) ?? null

  async function loadSkills() {
    const res = await fetch(`/api/skills?projectId=${projectId}`)
    if (res.ok) setSkills(await res.json())
  }

  useEffect(() => { loadSkills() }, [projectId])

  useEffect(() => {
    if (!selectedId) { setSelectedContent(null); return }
    fetch(`/api/skills/${selectedId}`).then(r => r.json()).then(d => {
      setSelectedContent(d.content ?? '')
      setEditContent(d.content ?? '')
    })
  }, [selectedId])

  useEffect(() => {
    if (creating && nameInputRef.current) nameInputRef.current.focus()
  }, [creating])

  const filtered = skills.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()))

  function handleNameChange(val: string) {
    setNewName(val)
    if (!keyEdited) setNewKey(generateKey(val))
  }

  async function handleCreateConfirm() {
    if (!newName.trim()) return
    const res = await fetch('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, name: newName.trim(), key: newKey }),
    })
    if (res.ok) {
      const created = await res.json()
      await loadSkills()
      setSelectedId(created.id)
      setCreating(false); setNewName(''); setNewKey(''); setKeyEdited(false)
    }
  }

  function handleCreateCancel() {
    setCreating(false); setNewName(''); setNewKey(''); setKeyEdited(false)
  }

  async function handleSave() {
    if (!selectedId) return
    setSaving(true)
    await fetch(`/api/skills/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editContent }),
    })
    setSaving(false)
    const r = await fetch(`/api/skills/${selectedId}`)
    if (r.ok) { const d = await r.json(); setSelectedContent(d.content) }
  }

  async function handleDelete() {
    if (!selectedSkill) return
    if (!window.confirm(`Delete ${selectedSkill.name}? This will remove the file from disk.`)) return
    await fetch(`/api/skills/${selectedId}`, { method: 'DELETE' })
    setSelectedId(null)
    await loadSkills()
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: S.bg, fontFamily: 'system-ui, sans-serif' }}>
      {/* Left panel */}
      <div style={{ width: 240, flexShrink: 0, borderRight: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 8px', borderBottom: `1px solid ${S.border}` }}>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter skills…"
            style={{ flex: 1, background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontSize: 12, borderRadius: 4, padding: '4px 8px', outline: 'none' }}
          />
          <button
            onClick={() => setCreating(true)}
            style={{ background: 'none', border: 'none', color: S.primary, fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}
          >+</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {creating && (
            <div style={{ padding: 8, borderBottom: `1px solid ${S.border}` }}>
              <input
                ref={nameInputRef}
                value={newName}
                onChange={e => handleNameChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateConfirm()
                  if (e.key === 'Escape') handleCreateCancel()
                }}
                placeholder="Skill name"
                style={{ width: '100%', background: S.surface, border: `1px solid ${S.primary}`, color: S.text, fontSize: 12, borderRadius: 4, padding: '4px 8px', boxSizing: 'border-box', outline: 'none' }}
              />
              <input
                value={newKey}
                onChange={e => { setNewKey(e.target.value); setKeyEdited(true) }}
                style={{ width: '100%', marginTop: 4, background: S.surface, border: `1px solid ${S.border}`, color: S.muted, fontFamily: 'monospace', fontSize: 11, borderRadius: 4, padding: '4px 8px', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
          )}
          {filtered.map(s => (
            <div
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: `1px solid ${S.border}`, background: s.id === selectedId ? '#1a2530' : 'none' }}
            >
              <div style={{ color: S.text, fontSize: 13 }}>{s.name}</div>
              <div style={{ color: S.muted, fontSize: 11, fontFamily: 'monospace' }}>{s.key}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column' }}>
        {!selectedSkill ? (
          <div style={{ color: S.muted, fontSize: 13, margin: 'auto' }}>Select a skill to view or edit it.</div>
        ) : (
          <>
            <h2 style={{ color: S.text, fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>{selectedSkill.name}</h2>
            <span style={{ color: S.muted, fontSize: 12, fontFamily: 'monospace', display: 'block', marginBottom: 16 }}>{selectedSkill.key}</span>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {(['view', 'code'] as const).map(m => (
                <button key={m} onClick={() => setViewMode(m)} style={{
                  background: 'none', borderRadius: 5, padding: '4px 12px', fontSize: 12, cursor: 'pointer', textTransform: 'capitalize',
                  border: viewMode === m ? `1px solid ${S.primary}` : `1px solid ${S.border}`,
                  color: viewMode === m ? S.primary : S.muted,
                }}>{m}</button>
              ))}
            </div>
            {viewMode === 'view' ? (
              <pre style={{ whiteSpace: 'pre-wrap', color: '#c9d1d9', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6, margin: 0, flex: 1 }}>
                {selectedContent ?? ''}
              </pre>
            ) : (
              <>
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  style={{ width: '100%', minHeight: 300, background: S.surface, border: `1px solid ${S.border}`, color: S.text, fontFamily: 'monospace', fontSize: 13, padding: 12, borderRadius: 6, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
                />
                <button onClick={handleSave} disabled={saving}
                  style={{ alignSelf: 'flex-start', marginTop: 10, background: '#0d1a2d', color: S.primary, border: `1px solid ${S.primary}33`, borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            )}
            <div style={{ marginTop: 32 }}>
              <button onClick={handleDelete}
                style={{ background: 'none', color: S.danger, border: `1px solid ${S.danger}33`, borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
                Delete skill
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
