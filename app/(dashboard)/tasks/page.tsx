'use client'
import { ExternalTaskDashboard } from '@/components/tasks/ExternalTaskDashboard'

export default function CrossProjectTasksPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Tasks</h1>
        <p className="text-sm text-text-secondary mt-1">
          External tasks across all projects.
        </p>
      </div>
      <ExternalTaskDashboard apiUrl="/api/external-tasks" showProjectColumn />
    </div>
  )
}
