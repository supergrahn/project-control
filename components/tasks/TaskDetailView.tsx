'use client'
import { useState, useEffect } from 'react'
import type { Task } from '@/lib/db/tasks'
import type { Agent } from '@/lib/db/agents'
import { patchTask } from '@/hooks/useTasks'
import { LiveRunsSection } from '@/components/tasks/LiveRunsSection'
import { SessionHistoryPanel } from '@/components/sessions/SessionHistoryPanel'
import { PropertiesPanel } from '@/components/tasks/PropertiesPanel'

type DrawerSection = 'artifacts' | 'sessions' | 'notes'

type Todo = { id: string; content: string; status: 'completed' | 'in_progress' | 'pending' }

type Props = {
  task: Task
  activeSessionId?: string | null
  onOpenDrawer: (section: DrawerSection) => void
}

export function TaskDetailView({ task, activeSessionId, onOpenDrawer }: Props) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.notes ?? '')
  const [todos, setTodos] = useState<Todo[]>([])
  const [showAgentPicker, setShowAgentPicker] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])

  useEffect(() => {
    fetch(`/api/agents?projectId=${task.project_id}`)
      .then(r => r.json())
      .then(data => setAgents(data))
      .catch(() => {})
  }, [task.project_id])

  async function handleRunWithAgent(agentId: string) {
    setShowAgentPicker(false)
    await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: task.project_id,
        phase: task.status === 'done' ? 'develop' : task.status,
        taskId: task.id,
        userContext: '',
        permissionMode: 'default',
        agentId,
      }),
    })
  }

  return (
    <div className="flex h-full relative">
      {/* Left column */}
      <div className="flex-1 overflow-y-auto px-7 py-6 min-w-0">
        {/* Header breadcrumb */}
        <div className="text-text-faint text-[11px] mb-2">
          {task.project_id} / {task.id}
        </div>

        {/* Editable title */}
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={() => {
            if (title !== task.title) patchTask(task.id, { title }).catch(console.error)
          }}
          className="w-full bg-transparent border-none border-b border-border-default text-text-primary text-[18px] font-bold mb-4 px-0 py-1 outline-none"
        />

        {/* Editable description */}
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          onBlur={() => {
            if (description !== (task.notes ?? '')) patchTask(task.id, { notes: description }).catch(console.error)
          }}
          rows={4}
          className="w-full bg-bg-primary border border-border-default rounded-[6px] text-text-secondary text-[13px] px-2.5 py-2 resize-vertical outline-none mb-5 box-border"
        />

        {/* Drawer buttons */}
        <div className="flex gap-1.5 mb-6 items-center flex-wrap relative">
          {(['artifacts', 'sessions', 'notes'] as DrawerSection[]).map(s => (
            <button
              key={s}
              onClick={() => onOpenDrawer(s)}
              className="bg-bg-secondary text-text-muted border border-border-default rounded-[6px] px-2 py-1 text-[11px] cursor-pointer capitalize"
            >
              {s}
            </button>
          ))}
          <button
            onClick={() => setShowAgentPicker(v => !v)}
            className="border border-accent-blue border-opacity-[0.13] rounded-[6px] px-2 py-1 text-[11px] cursor-pointer"
            style={{ background: '#0d1a2d', color: '#5b9bd5' }}
          >
            Run with agent
          </button>
          {showAgentPicker && (
            <div className="absolute top-full left-0 mt-1 bg-bg-primary border border-border-default rounded-lg p-2 z-20 min-w-[180px]">
              {agents.length === 0 && (
                <div className="text-text-muted text-[12px] px-2 py-1">No agents</div>
              )}
              {agents.map(a => (
                <button
                  key={a.id}
                  onClick={() => handleRunWithAgent(a.id)}
                  className="block w-full bg-none border-none text-text-primary text-[13px] text-left px-2.5 py-1.5 cursor-pointer rounded-[6px]"
                >
                  {a.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Live runs */}
        <LiveRunsSection taskId={task.id} onTodos={setTodos} />

        {/* Agent Tasks checklist */}
        {todos.length > 0 && (
          <div className="mt-5">
            <div className="text-text-secondary text-[11px] font-semibold uppercase tracking-[0.04em] mb-2">
              Agent Tasks
            </div>
            {todos.map(todo => (
              <div
                key={todo.id}
                className="text-[13px] py-0.5"
                style={{
                  color: todo.status === 'completed' ? '#5a6370' : todo.status === 'in_progress' ? '#e2e6ea' : '#5a6370',
                  fontWeight: todo.status === 'in_progress' ? 700 : 400,
                  textDecoration: todo.status === 'completed' ? 'line-through' : 'none',
                }}
              >
                {todo.content}
              </div>
            ))}
          </div>
        )}

        {/* Session History */}
        <SessionHistoryPanel taskId={task.id} />

        {/* Comments placeholder */}
        <div className="text-text-disabled text-[12px] border-t border-border-subtle pt-4 mt-6">
          Comments (coming soon)
        </div>
      </div>

      {/* Right column */}
      <PropertiesPanel task={task} />
    </div>
  )
}
