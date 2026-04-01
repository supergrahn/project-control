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
    <div className="min-h-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-text-primary text-base font-bold m-0">Agents</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-accent-blue/15 text-accent-blue border border-accent-blue/15 rounded-[var(--radius-control)] px-3.5 py-1.5 text-xs cursor-pointer font-medium hover:bg-accent-blue/25"
        >
          Create agent
        </button>
      </div>

      {agents.length === 0 && (
        <div className="text-text-secondary text-sm text-center pt-10">
          No agents yet. Create one to get started.
        </div>
      )}

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
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
