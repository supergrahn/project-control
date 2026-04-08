'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import useSWR from 'swr'
import { useTasks, patchTask } from '@/hooks/useTasks'
import { TaskCard } from '@/components/tasks/TaskCard'
import { TaskDetailView } from '@/components/tasks/TaskDetailView'
import { RightDrawer } from '@/components/tasks/RightDrawer'
import { CreateTaskModal } from '@/components/tasks/CreateTaskModal'
import type { Task } from '@/lib/db/tasks'
import type { DrawerSection } from '@/components/tasks/RightDrawer'
import { fetcher } from '@/lib/fetcher'

export default function IdeasPage() {
  const { projectId } = useParams() as { projectId: string }
  const { tasks, isLoading } = useTasks(projectId, 'idea')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [drawerSection, setDrawerSection] = useState<DrawerSection | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)

  const { data: taskSessions } = useSWR(
    selectedTask ? `/api/sessions?projectId=${projectId}&taskId=${selectedTask.id}` : null,
    fetcher,
    { refreshInterval: 3000 }
  )

  async function handleNavigate(taskId: string) {
    const res = await fetch(`/api/tasks/${taskId}`)
    if (res.ok) {
      const t = await res.json()
      setSelectedTask(t)
    }
    setShowNewModal(false)
  }

  if (isLoading) return <div className="p-6 text-text-secondary">Loading…</div>

  if (selectedTask) {
    return (
      <div className="flex h-full">
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-4 border-b border-border-default">
            <button onClick={() => setSelectedTask(null)} className="bg-transparent border-none text-text-muted cursor-pointer text-xs">
              ← Ideas
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
    <div className="p-6">
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-text-primary text-base font-bold m-0">💡 Ideas</h1>
        <button
          onClick={() => setShowNewModal(true)}
          className="bg-accent-blue/15 text-accent-blue border border-accent-blue/[0.13] rounded px-3 py-1.5 text-xs cursor-pointer"
        >
          + New Task
        </button>
      </div>

      {tasks.length === 0 && (
        <div className="text-text-disabled text-sm text-center pt-10">No ideas yet</div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            onOpen={setSelectedTask}
            onAction={async (t, action) => {
              if (action === 'Start Spec') await patchTask(t.id, { status: 'speccing' })
            }}
          />
        ))}
      </div>

      {showNewModal && (
        <CreateTaskModal
          projectId={projectId}
          onCreated={() => {}}
          onClose={() => setShowNewModal(false)}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  )
}
