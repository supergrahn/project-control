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
      style={{
        background: '#141618',
        border: `1px solid ${hovered ? '#2a2f35' : '#1e2124'}`,
        borderRadius: 10,
        padding: 16,
        cursor: 'pointer',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span
          data-testid="status-dot"
          style={{
            width: 8, height: 8, borderRadius: '50%',
            background: STATUS_COLORS[agent.status] ?? '#8a9199',
            display: 'inline-block', flexShrink: 0,
          }}
        />
        <span style={{ fontWeight: 700, color: '#e2e6ea', fontSize: 14 }}>{agent.name}</span>
      </div>
      {agent.title && (
        <div style={{ color: '#8a9199', fontSize: 12, marginBottom: 8, marginLeft: 16 }}>{agent.title}</div>
      )}
      {providerName && (
        <div style={{ marginLeft: 16 }}>
          <span style={{
            background: '#141618', border: '1px solid #1e2124',
            color: '#5b9bd5', fontSize: 11, borderRadius: 4, padding: '2px 6px',
          }}>
            {providerName}
          </span>
        </div>
      )}
    </div>
  )
}
