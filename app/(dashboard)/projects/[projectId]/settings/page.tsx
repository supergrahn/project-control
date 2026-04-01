'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import TaskSourceSettings from '@/components/projects/TaskSourceSettings'

export default function SettingsPage() {
  const { projectId } = useParams() as { projectId: string }
  const [migrating, setMigrating] = useState(false)
  const [migrateResult, setMigrateResult] = useState<{ created: number; skipped: number } | null>(null)

  async function handleMigrate() {
    setMigrating(true)
    try {
      const res = await fetch('/api/migrate/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      setMigrateResult(await res.json())
    } finally {
      setMigrating(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 600 }}>
      <h1 style={{ color: '#e2e6ea', fontSize: 16, fontWeight: 700, marginBottom: 24, margin: '0 0 24px' }}>
        ⚙️ Settings
      </h1>

      <div style={{ borderBottom: '1px solid #1c1f22', paddingBottom: 20, marginBottom: 20 }}>
        <TaskSourceSettings projectId={projectId} />
      </div>

      <div style={{ borderTop: '1px solid #1c1f22', paddingTop: 20, marginTop: 20 }}>
        <div style={{ color: '#8a9199', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Task Migration</div>
        <div style={{ color: '#5a6370', fontSize: 12, marginBottom: 12 }}>
          Import existing ideas, specs, and plans files into the task system. Safe to run multiple times.
        </div>
        <button
          onClick={handleMigrate}
          disabled={migrating}
          style={{
            background: '#141618',
            color: '#8a9199',
            border: '1px solid #1c1f22',
            borderRadius: 6,
            padding: '6px 14px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          {migrating ? 'Migrating…' : 'Run Migration'}
        </button>
        {migrateResult && (
          <div style={{ color: '#3a8c5c', fontSize: 12, marginTop: 8 }}>
            ✓ Created {migrateResult.created} tasks, skipped {migrateResult.skipped} existing
          </div>
        )}
      </div>
    </div>
  )
}
