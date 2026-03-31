'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import useSWR from 'swr'
import { useTasks, patchTask } from '@/hooks/useTasks'
import { TaskCard } from '@/components/tasks/TaskCard'
import { TaskDetailView } from '@/components/tasks/TaskDetailView'
import { RightDrawer } from '@/components/tasks/RightDrawer'
import type { Task } from '@/lib/db/tasks'
import type { DrawerSection } from '@/components/tasks/RightDrawer'

export default function PlansPage() {
  const { projectId } = useParams() as { projectId: string }
  const { tasks, isLoading } = useTasks(projectId, 'planning')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [drawerSection, setDrawerSection] = useState<DrawerSection | null>(null)

  const { data: taskSessions } = useSWR(
    selectedTask ? `/api/sessions?projectId=${projectId}&taskId=${selectedTask.id}` : null,
    (url: string) => fetch(url).then(r => r.json()),
    { refreshInterval: 3000 }
  )

  if (isLoading) return <div style={{ padding: 24, color: '#454c54' }}>Loading…</div>

  if (selectedTask) {
    return (
      <div style={{ display: 'flex', height: '100%' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #1c1f22' }}>
            <button onClick={() => setSelectedTask(null)} style={{ background: 'none', border: 'none', color: '#5a6370', cursor: 'pointer', fontSize: 12 }}>
              ← Plans
            </button>
          </div>
          <TaskDetailView
            task={selectedTask}
            activeSessionId={taskSessions?.find((s: any) => !s.ended_at)?.id ?? null}
            onOpenDrawer={setDrawerSection}
          />
        </div>
        <RightDrawer
          task={selectedTask}
          section={drawerSection}
          sessions={taskSessions ?? []}
          onClose={() => setDrawerSection(null)}
          onNotesChange={async (notes) => { await patchTask(selectedTask.id, { notes }) }}
        />
      </div>
    )
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ color: '#e2e6ea', fontSize: 16, fontWeight: 700, margin: 0 }}>📋 Plans</h1>
      </div>

      {tasks.length === 0 && (
        <div style={{ color: '#2e3338', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>No plans yet</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            onOpen={setSelectedTask}
            onAction={async (t, action) => {
              if (action === 'Start Dev') await patchTask(t.id, { status: 'developing' })
            }}
          />
        ))}
      </div>
    </div>
  )
}
