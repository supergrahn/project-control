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
    return <div className="p-4 text-text-secondary text-sm">Loading…</div>
  }

  return (
    <div className="p-4">
      <p className="text-text-secondary text-xs mb-4">
        All project skills are automatically injected into this agent's sessions.
      </p>
      {skills.length === 0 ? (
        <div className="text-text-secondary text-sm">
          No skills configured yet. Add skills under <strong>Skills</strong> in the sidebar.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {skills.map(s => (
            <div key={s.id} className="bg-bg-secondary border border-border-subtle rounded-md p-3.5">
              <div className="text-text-primary text-sm font-semibold mb-0.5">{s.name}</div>
              <div className="text-text-secondary text-xs font-mono" style={{ marginBottom: s.preview ? 1.5 : 0 }}>
                {s.key}
              </div>
              {s.preview && (
                <div className="text-text-secondary text-xs">{s.preview}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
