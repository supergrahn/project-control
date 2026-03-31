'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useTasks, patchTask } from '@/hooks/useTasks'
import { TaskCard } from '@/components/tasks/TaskCard'
import { TaskDetailView } from '@/components/tasks/TaskDetailView'
import { RightDrawer } from '@/components/tasks/RightDrawer'
import type { Task } from '@/lib/db/tasks'
import type { DrawerSection } from '@/components/tasks/RightDrawer'

export default function SpecsPage() {
  const { projectId } = useParams() as { projectId: string }
  const { tasks, isLoading } = useTasks(projectId, 'speccing')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [drawerSection, setDrawerSection] = useState<DrawerSection | null>(null)

  if (isLoading) return <div style={{ padding: 24, color: '#454c54' }}>Loading…</div>

  if (selectedTask) {
    return (
      <div style={{ display: 'flex', height: '100%' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #1c1f22' }}>
            <button onClick={() => setSelectedTask(null)} style={{ background: 'none', border: 'none', color: '#5a6370', cursor: 'pointer', fontSize: 12 }}>
              ← Specs
            </button>
          </div>
          <TaskDetailView task={selectedTask} onOpenDrawer={setDrawerSection} />
        </div>
        <RightDrawer
          task={selectedTask}
          section={drawerSection}
          sessions={[]}
          onClose={() => setDrawerSection(null)}
          onNotesChange={async (notes) => { await patchTask(selectedTask.id, { notes }) }}
        />
      </div>
    )
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ color: '#e2e6ea', fontSize: 16, fontWeight: 700, margin: 0 }}>📐 Specs</h1>
      </div>

      {tasks.length === 0 && (
        <div style={{ color: '#2e3338', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>No specs yet</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            onOpen={setSelectedTask}
            onAction={async (t, action) => {
              if (action === 'Start Plan') await patchTask(t.id, { status: 'planning' })
            }}
          />
        ))}
      </div>
    </div>
  )
}
