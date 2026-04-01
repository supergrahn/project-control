'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import useSWR from 'swr'
import type { Agent } from '@/lib/db/agents'
import { SkillsTab as SkillsTabComponent } from '@/components/agents/SkillsTab'

const fetcher = (url: string) => fetch(url).then(r => r.json())

type Tab = 'dashboard' | 'instructions' | 'configuration' | 'runs' | 'skills'

type Provider = { id: string; name: string }

type Session = {
  id: string
  task_id: string | null
  phase: string
  status: string
  created_at: string
  ended_at: string | null
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'instructions', label: 'Instructions' },
  { key: 'configuration', label: 'Configuration' },
  { key: 'runs', label: 'Runs' },
  { key: 'skills', label: 'Skills' },
]

function formatDate(iso: string) {
  return new Date(iso).toLocaleString()
}

function formatDuration(start: string, end: string | null) {
  if (!end) return '—'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const rem = secs % 60
  return `${mins}m ${rem}s`
}

export default function AgentDetailPage() {
  const { projectId, agentId } = useParams() as { projectId: string; agentId: string }
  const [tab, setTab] = useState<Tab>('dashboard')

  const { data: agent } = useSWR<Agent>(`/api/agents/${agentId}`, fetcher)

  return (
    <div className="bg-bg-primary min-h-full py-7 px-8">
      <div className="text-text-faint text-xs mb-3">
        {projectId} / agents / {agentId}
      </div>

      <h1 className="text-text-primary text-lg font-bold m-0 mb-5">
        {agent?.name ?? '…'}
        {agent?.title && (
          <span className="text-text-secondary text-xs font-normal ml-2.5">
            {agent.title}
          </span>
        )}
      </h1>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3.5 py-1.5 text-xs cursor-pointer border-0 ${
              tab === t.key
                ? 'bg-border-subtle text-text-primary font-semibold'
                : 'bg-transparent text-text-secondary font-normal hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && agent && <DashboardTab agent={agent} />}
      {tab === 'instructions' && <InstructionsTab agentId={agentId} />}
      {tab === 'configuration' && agent && <ConfigurationTab agent={agent} agentId={agentId} />}
      {tab === 'runs' && <RunsTab agentId={agentId} />}
      {tab === 'skills' && <SkillsTabComponent projectId={projectId} />}
    </div>
  )
}

function DashboardTab({ agent }: { agent: Agent }) {
  const statusStyles: Record<string, { bg: string; text: string }> = {
    idle:    { bg: 'bg-border-subtle', text: 'text-text-secondary' },
    running: { bg: 'bg-accent-green/15', text: 'text-accent-green' },
    paused:  { bg: 'bg-orange-900', text: 'text-accent-orange' },
  }
  const style = statusStyles[agent.status] ?? statusStyles.idle

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <span className={`${style.bg} ${style.text} rounded-md px-2.5 py-1 text-xs font-semibold`}>
          {agent.status}
        </span>
      </div>
      <button
        disabled
        className="bg-border-subtle text-text-faint border-0 rounded-md px-3.5 py-1.75 text-xs cursor-not-allowed"
      >
        Run heartbeat — Coming soon
      </button>
    </div>
  )
}

function InstructionsTab({ agentId }: { agentId: string }) {
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch(`/api/agents/${agentId}/instructions`)
      .then(r => r.json())
      .then(data => {
        setContent(data.content ?? '')
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [agentId])

  async function handleSave() {
    await fetch(`/api/agents/${agentId}/instructions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!loaded) return <div className="text-text-faint text-sm">Loading…</div>

  return (
    <div>
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        className="font-mono text-sm bg-black text-gray-300 w-full min-h-96 resize-vertical border border-border-default rounded-md p-3 outline-none box-border mb-3"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          className="bg-accent-blue/15 text-accent-blue border border-accent-blue/15 rounded-[var(--radius-control)] px-3.5 py-1.5 text-xs cursor-pointer font-medium hover:bg-accent-blue/25"
        >
          Save
        </button>
        {saved && <span className="text-accent-green text-sm">Saved</span>}
      </div>
    </div>
  )
}

function ConfigurationTab({ agent, agentId }: { agent: Agent; agentId: string }) {
  const [name, setName] = useState(agent.name)
  const [title, setTitle] = useState(agent.title ?? '')
  const [providerId, setProviderId] = useState(agent.provider_id ?? '')
  const [model, setModel] = useState(agent.model ?? '')
  const [saved, setSaved] = useState(false)

  const { data: providers = [] } = useSWR<Provider[]>('/api/providers', fetcher)

  async function handleSave() {
    await fetch(`/api/agents/${agentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, title, provider_id: providerId || null, model: model || null }),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-sm">
      <div className="mb-4">
        <label className="block mb-1.5 text-xs font-normal text-text-secondary">Name</label>
        <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-gray-700 border border-border-default rounded-md px-2.5 py-2 text-gray-100 text-sm box-border outline-none" />
      </div>
      <div className="mb-4">
        <label className="block mb-1.5 text-xs font-normal text-text-secondary">Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-gray-700 border border-border-default rounded-md px-2.5 py-2 text-gray-100 text-sm box-border outline-none" />
      </div>
      <div className="mb-4">
        <label className="block mb-1.5 text-xs font-normal text-text-secondary">Provider</label>
        <select
          value={providerId}
          onChange={e => setProviderId(e.target.value)}
          className="w-full bg-gray-700 border border-border-default rounded-md px-2.5 py-2 text-gray-100 text-sm box-border outline-none"
        >
          <option value="">— None —</option>
          {providers.map((p: Provider) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <div className="mb-6">
        <label className="block mb-1.5 text-xs font-normal text-text-secondary">Model</label>
        <input value={model} onChange={e => setModel(e.target.value)} placeholder="Provider default" className="w-full bg-gray-700 border border-border-default rounded-md px-2.5 py-2 text-gray-100 text-sm box-border outline-none" />
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          className="bg-accent-blue/15 text-accent-blue border border-accent-blue/15 rounded-[var(--radius-control)] px-3.5 py-1.5 text-xs cursor-pointer font-medium hover:bg-accent-blue/25"
        >
          Save
        </button>
        {saved && <span className="text-accent-green text-sm">Saved</span>}
      </div>
    </div>
  )
}

function RunsTab({ agentId }: { agentId: string }) {
  const { data: sessions = [] } = useSWR<Session[]>(
    `/api/sessions?agentId=${agentId}`,
    fetcher,
  )

  const statusColors: Record<string, string> = {
    active:    '#3a8c5c',
    completed: '#5a6370',
    error:     '#c04040',
  }

  if (sessions.length === 0) {
    return <div className="text-text-secondary text-sm">No runs yet</div>
  }

  return (
    <table className="w-full border-collapse text-sm text-gray-300">
      <thead>
        <tr className="text-text-faint text-xs text-left">
          <th className="pb-1.5 pr-0 font-semibold">Task</th>
          <th className="pb-1.5 px-3 font-semibold">Phase</th>
          <th className="pb-1.5 px-3 font-semibold">Status</th>
          <th className="pb-1.5 px-3 font-semibold">Started</th>
          <th className="pb-1.5 px-3 font-semibold">Duration</th>
        </tr>
      </thead>
      <tbody>
        {sessions.map(s => (
          <tr key={s.id} className="border-t border-border-default">
            <td className="py-2 pr-0 text-text-secondary">{s.task_id ?? '—'}</td>
            <td className="py-2 px-3">{s.phase}</td>
            <td className="py-2 px-3">
              <span
                className="rounded px-1.75 py-0.5 text-xs"
                style={{
                  color: statusColors[s.status] ?? '#8a9199',
                  background: '#1e2124',
                }}
              >
                {s.status}
              </span>
            </td>
            <td className="py-2 px-3 text-text-secondary">{formatDate(s.created_at)}</td>
            <td className="py-2 px-3 text-text-secondary">{formatDuration(s.created_at, s.ended_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
