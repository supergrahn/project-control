'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import type { Skill } from '@/lib/db/skills'

function generateKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
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
    <div className="flex h-full bg-bg-primary font-sans">
      {/* Left panel */}
      <div className="w-60 flex-shrink-0 border-r border-border-subtle flex flex-col">
        <div className="flex items-center gap-1.5 p-2 border-b border-border-subtle">
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter skills…"
            className="flex-1 bg-bg-secondary border border-border-subtle text-text-primary text-xs rounded px-2 py-1 outline-none"
          />
          <button
            onClick={() => setCreating(true)}
            className="bg-none border-none text-accent-blue text-lg cursor-pointer leading-none p-0.5"
          >+</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {creating && (
            <div className="p-2 border-b border-border-subtle">
              <input
                ref={nameInputRef}
                value={newName}
                onChange={e => handleNameChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateConfirm()
                  if (e.key === 'Escape') handleCreateCancel()
                }}
                placeholder="Skill name"
                className="w-full bg-bg-secondary border border-accent-blue text-text-primary text-xs rounded px-2 py-1 box-border outline-none"
              />
              <input
                value={newKey}
                onChange={e => { setNewKey(e.target.value); setKeyEdited(true) }}
                className="w-full mt-1 bg-bg-secondary border border-border-subtle text-text-secondary font-mono text-xs rounded px-2 py-1 box-border outline-none"
              />
            </div>
          )}
          {filtered.map(s => (
            <div
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`p-2 cursor-pointer border-b border-border-subtle ${s.id === selectedId ? 'bg-bg-tertiary' : ''}`}
            >
              <div className="text-text-primary text-sm">{s.name}</div>
              <div className="text-text-secondary text-xs font-mono">{s.key}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col">
        {!selectedSkill ? (
          <div className="text-text-secondary text-sm m-auto">Select a skill to view or edit it.</div>
        ) : (
          <>
            <h2 className="text-text-primary text-base font-semibold m-0 mb-1">{selectedSkill.name}</h2>
            <span className="text-text-secondary text-xs font-mono block mb-4">{selectedSkill.key}</span>
            <div className="flex gap-1.5 mb-4">
              {(['view', 'code'] as const).map(m => (
                <button key={m} onClick={() => setViewMode(m)} className={`bg-none rounded px-3 py-1 text-xs cursor-pointer capitalize border transition-colors ${
                  viewMode === m
                    ? 'border-accent-blue text-accent-blue'
                    : 'border-border-subtle text-text-secondary hover:bg-bg-tertiary'
                }`}>{m}</button>
              ))}
            </div>
            {viewMode === 'view' ? (
              <pre className="whitespace-pre-wrap text-text-primary font-inherit text-sm leading-relaxed m-0 flex-1">
                {selectedContent ?? ''}
              </pre>
            ) : (
              <>
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className="w-full min-h-80 bg-bg-secondary border border-border-subtle text-text-primary font-mono text-sm p-3 rounded resize-vertical box-border outline-none"
                />
                <button onClick={handleSave} disabled={saving}
                  className="self-start mt-2.5 bg-transparent text-accent-blue border border-accent-blue border-opacity-20 rounded px-3.5 py-1.5 text-xs cursor-pointer hover:border-opacity-40 disabled:opacity-60">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            )}
            <div className="mt-8">
              <button onClick={handleDelete}
                className="bg-none text-status-error border border-status-error border-opacity-20 rounded px-3.5 py-1.5 text-xs cursor-pointer hover:border-opacity-40">
                Delete skill
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
