'use client'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { AgentCard } from '@/components/agents/AgentCard'
import { CreateAgentModal } from '@/components/agents/CreateAgentModal'
import type { Agent } from '@/lib/db/agents'

const fetcher = (url: string) => fetch(url).then(r => r.json())

type Provider = { id: string; name: string }

export default function AgentsPage() {
  const { projectId } = useParams() as { projectId: string }
  const router = useRouter()
  const [showCreateModal, setShowCreateModal] = useState(false)

  const { data: agents = [], mutate } = useSWR<Agent[]>(
    `/api/agents?projectId=${projectId}`,
    fetcher,
  )

  const { data: providers = [] } = useSWR<Provider[]>('/api/providers', fetcher)

  const providerMap: Record<string, string> = {}
  for (const p of providers) {
    providerMap[p.id] = p.name
  }

  return (
    <div style={{ background: '#0d0e10', minHeight: '100%', padding: '28px 32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ color: '#e2e6ea', fontSize: 16, fontWeight: 700, margin: 0 }}>Agents</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '7px 14px',
            fontSize: 13,
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Create agent
        </button>
      </div>

      {agents.length === 0 && (
        <div style={{ color: '#8a9199', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>
          No agents yet. Create one to get started.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {agents.map(agent => (
          <AgentCard
            key={agent.id}
            agent={agent}
            providerName={providerMap[agent.provider_id ?? ''] ?? null}
            onClick={() => router.push(`/projects/${projectId}/agents/${agent.id}`)}
          />
        ))}
      </div>

      {showCreateModal && (
        <CreateAgentModal
          projectId={projectId}
          onCreated={() => {
            mutate()
            setShowCreateModal(false)
          }}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  )
}
