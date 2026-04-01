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
    <div className="p-6 max-w-2xl">
      <h1 className="text-text-primary text-base font-bold mb-6 m-0">
        ⚙️ Settings
      </h1>

      <div className="border-b border-border-default pb-5 mb-5">
        <TaskSourceSettings projectId={projectId} />
      </div>

      <div className="border-t border-border-default pt-5 mt-5">
        <div className="text-text-secondary text-sm font-semibold mb-2">Task Migration</div>
        <div className="text-text-muted text-xs mb-3">
          Import existing ideas, specs, and plans files into the task system. Safe to run multiple times.
        </div>
        <button
          onClick={handleMigrate}
          disabled={migrating}
          className="bg-bg-secondary text-text-secondary border border-border-default rounded px-3.5 py-1.5 text-xs cursor-pointer hover:bg-bg-tertiary disabled:opacity-50"
        >
          {migrating ? 'Migrating…' : 'Run Migration'}
        </button>
        {migrateResult && (
          <div className="text-status-success text-xs mt-2">
            ✓ Created {migrateResult.created} tasks, skipped {migrateResult.skipped} existing
          </div>
        )}
      </div>
    </div>
  )
}
