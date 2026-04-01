'use client'
import { useState } from 'react'
import type { Task } from '@/lib/db/tasks'
import { patchTask } from '@/hooks/useTasks'
import { LiveRunsSection } from '@/components/tasks/LiveRunsSection'
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

  return (
    <div style={{ display: 'flex', height: '100%', fontFamily: 'system-ui, sans-serif' }}>
      {/* Left column */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', minWidth: 0 }}>
        {/* Header breadcrumb */}
        <div style={{ color: '#454c54', fontSize: 11, marginBottom: 8 }}>
          {task.project_id} / {task.id}
        </div>

        {/* Editable title */}
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={() => {
            if (title !== task.title) patchTask(task.id, { title }).catch(console.error)
          }}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid #1c1f22',
            color: '#e2e6ea',
            fontSize: 18,
            fontWeight: 700,
            fontFamily: 'system-ui, sans-serif',
            marginBottom: 16,
            padding: '4px 0',
            outline: 'none',
          }}
        />

        {/* Editable description */}
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          onBlur={() => {
            if (description !== (task.notes ?? '')) patchTask(task.id, { notes: description }).catch(console.error)
          }}
          rows={4}
          style={{
            width: '100%',
            background: '#0e1012',
            border: '1px solid #1c1f22',
            borderRadius: 6,
            color: '#8a9199',
            fontSize: 13,
            fontFamily: 'system-ui, sans-serif',
            padding: '8px 10px',
            resize: 'vertical',
            outline: 'none',
            marginBottom: 20,
            boxSizing: 'border-box',
          }}
        />

        {/* Drawer buttons */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {(['artifacts', 'sessions', 'notes'] as DrawerSection[]).map(s => (
            <button
              key={s}
              onClick={() => onOpenDrawer(s)}
              style={{
                background: '#141618',
                color: '#5a6370',
                border: '1px solid #1c1f22',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 11,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Live runs */}
        <LiveRunsSection taskId={task.id} onTodos={setTodos} />

        {/* Agent Tasks checklist */}
        {todos.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ color: '#8a9199', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Agent Tasks
            </div>
            {todos.map(todo => (
              <div
                key={todo.id}
                style={{
                  color: todo.status === 'completed' ? '#5a6370' : todo.status === 'in_progress' ? '#e2e6ea' : '#5a6370',
                  fontWeight: todo.status === 'in_progress' ? 700 : 400,
                  textDecoration: todo.status === 'completed' ? 'line-through' : 'none',
                  fontSize: 13,
                  padding: '3px 0',
                }}
              >
                {todo.content}
              </div>
            ))}
          </div>
        )}

        {/* Comments placeholder */}
        <div style={{ color: '#2e3338', fontSize: 12, borderTop: '1px solid #1e2124', paddingTop: 16, marginTop: 24 }}>
          Comments (coming soon)
        </div>
      </div>

      {/* Right column */}
      <PropertiesPanel task={task} />
    </div>
  )
}
