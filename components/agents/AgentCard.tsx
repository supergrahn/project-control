'use client'
import { useState } from 'react'
import type { Agent } from '@/lib/db/agents'

const STATUS_COLORS: Record<string, string> = {
  idle: '#8a9199',
  running: '#3a8c5c',
  paused: '#c97e2a',
}

type Props = {
  agent: Agent
  providerName: string | null
  onClick: () => void
}

export function AgentCard({ agent, providerName, onClick }: Props) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`bg-bg-secondary rounded-card p-4 cursor-pointer ${
        hovered ? 'border border-border-hover' : 'border border-border-subtle'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          data-testid="status-dot"
          className="w-2 h-2 rounded-full inline-block flex-shrink-0"
          style={{
            background: STATUS_COLORS[agent.status] ?? '#8a9199',
          }}
        />
        <span className="font-bold text-text-primary text-base">{agent.name}</span>
      </div>
      {agent.title && (
        <div className="text-text-secondary text-sm mb-2 ml-4">{agent.title}</div>
      )}
      {providerName && (
        <div className="ml-4">
          <span className="bg-bg-secondary border border-border-subtle text-accent-blue text-xs rounded px-1.5 py-0.5">
            {providerName}
          </span>
        </div>
      )}
    </div>
  )
}
