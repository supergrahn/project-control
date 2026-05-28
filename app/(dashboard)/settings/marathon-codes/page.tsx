'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

type Project = {
  id: string
  name: string
  path: string
  marathon_code: string | null
  marathon_account: string | null
  marathon_default_wt: string | null
}
type WorkTypeCode = { id: number; code: string; name: string; marathon_legacy_code: string | null }

const jsonFetch = (url: string) => fetch(url).then(async (r) => { if (!r.ok) throw new Error(await r.text()); return r.json() })

export default function MarathonCodesPage() {
  const qc = useQueryClient()
  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ['projects'], queryFn: () => jsonFetch('/api/projects') })
  const { data: wtcs = [] } = useQuery<WorkTypeCode[]>({ queryKey: ['wtc'], queryFn: () => jsonFetch('/api/work-type-codes') })

  const patchProject = useMutation({
    mutationFn: ({ id, field, value }: { id: string; field: string; value: string }) =>
      fetch(`/api/projects/${id}/marathon`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value || null }),
      }).then((r) => { if (!r.ok) throw new Error('save failed'); return r.json() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const addWtc = useMutation({
    mutationFn: () =>
      fetch('/api/work-type-codes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: newCode, name: newName }),
      }).then((r) => { if (!r.ok) throw new Error('save failed'); return r.json() }),
    onSuccess: () => { setNewCode(''); setNewName(''); qc.invalidateQueries({ queryKey: ['wtc'] }) },
  })
  const delWtc = useMutation({
    mutationFn: (id: number) => fetch(`/api/work-type-codes/${id}`, { method: 'DELETE' }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wtc'] }),
  })

  const input = 'bg-bg-primary border border-border-subtle rounded px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent-blue'

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-10">
      <div>
        <h1 className="text-text-primary text-lg font-bold mb-1">Marathon codes</h1>
        <p className="text-text-muted text-xs mb-5">
          These flow down to TimeBalloon, which uses them when grouping the day into buckets and exporting to Marathon.
        </p>
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 px-2 text-[10px] font-black uppercase tracking-widest text-text-faint">
            <div className="col-span-4">Project</div>
            <div className="col-span-2">Code</div>
            <div className="col-span-2">Account</div>
            <div className="col-span-4">Default work-type</div>
          </div>
          {projects.map((p) => (
            <div key={p.id} className="grid grid-cols-12 gap-2 items-center bg-bg-secondary border border-border-subtle rounded-lg p-2">
              <div className="col-span-4 min-w-0">
                <div className="text-text-primary text-sm font-medium truncate">{p.name}</div>
                <div className="text-text-faint text-[10px] truncate">{p.path}</div>
              </div>
              <input className={`col-span-2 ${input}`} defaultValue={p.marathon_code ?? ''} placeholder="063"
                onBlur={(e) => { if (e.target.value !== (p.marathon_code ?? '')) patchProject.mutate({ id: p.id, field: 'marathon_code', value: e.target.value }) }} />
              <input className={`col-span-2 ${input}`} defaultValue={p.marathon_account ?? ''} placeholder="RUSS"
                onBlur={(e) => { if (e.target.value !== (p.marathon_account ?? '')) patchProject.mutate({ id: p.id, field: 'marathon_account', value: e.target.value }) }} />
              <input className={`col-span-4 ${input}`} defaultValue={p.marathon_default_wt ?? ''} placeholder="063 - Backend programmering"
                onBlur={(e) => { if (e.target.value !== (p.marathon_default_wt ?? '')) patchProject.mutate({ id: p.id, field: 'marathon_default_wt', value: e.target.value }) }} />
            </div>
          ))}
          {projects.length === 0 && <div className="text-text-faint italic text-sm">No projects yet.</div>}
        </div>
      </div>

      <div>
        <h2 className="text-text-primary text-base font-bold mb-1">Work-type codes</h2>
        <p className="text-text-muted text-xs mb-4">The fixed catalogue (e.g. 063 - Backend programmering). TimeBalloon caches these.</p>
        <div className="space-y-1.5 mb-4">
          {wtcs.map((w) => (
            <div key={w.id} className="flex items-center gap-3 bg-bg-secondary border border-border-subtle rounded-lg px-3 py-2">
              <span className="font-mono text-accent-blue text-sm w-12">{w.code}</span>
              <span className="text-text-primary text-sm flex-1">{w.name}</span>
              <button onClick={() => delWtc.mutate(w.id)} className="text-text-faint hover:text-status-error text-xs">✕</button>
            </div>
          ))}
          {wtcs.length === 0 && <div className="text-text-faint italic text-sm">No work-type codes yet.</div>}
        </div>
        <div className="flex items-center gap-2">
          <input className={`${input} w-20`} value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="063" />
          <input className={`${input} flex-1`} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Backend programmering"
            onKeyDown={(e) => { if (e.key === 'Enter' && newCode.trim() && newName.trim()) addWtc.mutate() }} />
          <button
            onClick={() => { if (newCode.trim() && newName.trim()) addWtc.mutate() }}
            className="bg-accent-blue/15 text-accent-blue border border-accent-blue/15 rounded px-3.5 py-1.5 text-xs font-medium hover:bg-accent-blue/25"
          >Add</button>
        </div>
      </div>
    </div>
  )
}
