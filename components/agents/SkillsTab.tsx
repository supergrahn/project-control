'use client'
import { useState, useEffect } from 'react'
import type { Skill } from '@/lib/db/skills'

type SkillWithPreview = Skill & { preview: string }

export function SkillsTab({ projectId }: { projectId: string }) {
  const [skills, setSkills] = useState<SkillWithPreview[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/skills?projectId=${projectId}`)
        if (!res.ok) { setLoading(false); return }
        const meta: Skill[] = await res.json()
        const withPreviews = await Promise.all(
          meta.map(async s => {
            try {
              const r = await fetch(`/api/skills/${s.id}`)
              if (!r.ok) return { ...s, preview: '' }
              const d = await r.json()
              const firstLine = (d.content as string)
                .split('\n')
                .find((l: string) => l.trim() && !l.startsWith('#')) ?? ''
              return { ...s, preview: firstLine }
            } catch {
              return { ...s, preview: '' }
            }
          })
        )
        setSkills(withPreviews)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [projectId])

  if (loading) {
    return <div style={{ padding: 16, color: '#8a9199', fontSize: 13 }}>Loading…</div>
  }

  return (
    <div style={{ padding: 16 }}>
      <p style={{ color: '#8a9199', fontSize: 12, marginBottom: 16 }}>
        All project skills are automatically injected into this agent's sessions.
      </p>
      {skills.length === 0 ? (
        <div style={{ color: '#8a9199', fontSize: 13 }}>
          No skills configured yet. Add skills under <strong>Skills</strong> in the sidebar.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {skills.map(s => (
            <div key={s.id} style={{ background: '#141618', border: '1px solid #1e2124', borderRadius: 6, padding: '10px 14px' }}>
              <div style={{ color: '#e2e6ea', fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{s.name}</div>
              <div style={{ color: '#8a9199', fontSize: 11, fontFamily: 'monospace', marginBottom: s.preview ? 6 : 0 }}>
                {s.key}
              </div>
              {s.preview && (
                <div style={{ color: '#8a9199', fontSize: 12 }}>{s.preview}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
