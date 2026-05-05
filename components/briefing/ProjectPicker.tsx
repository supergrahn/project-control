'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useProjects } from '@/hooks/useProjects'

export function ProjectPicker() {
  const router = useRouter()
  const params = useSearchParams()
  const current = params.get('projectId') ?? ''
  const { data: projects } = useProjects()

  function onChange(value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set('projectId', value)
    else next.delete('projectId')
    router.replace(`/briefing?${next.toString()}`)
  }

  return (
    <select
      value={current}
      onChange={e => onChange(e.target.value)}
      className="rounded border border-border-default bg-bg-secondary text-text-primary text-xs px-2 py-1"
      aria-label="Filter briefing by project"
    >
      <option value="">All projects</option>
      {projects?.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  )
}
