'use client'
import { useEffect, useMemo, useState } from 'react'
import { Play, X } from 'lucide-react'
import { useLaunchSession } from '@/hooks/useSessions'
import { patchTask, useTasks } from '@/hooks/useTasks'
import type { Task } from '@/lib/db/tasks'
import type { TaskStatus } from '@/lib/types'

type SourceKind = 'prompt' | 'idea' | 'spec' | 'plan'
type SessionGoal = 'brainstorm' | 'spec' | 'plan' | 'develop'

type Props = {
  projectId: string
  projectPath: string
  specsDir: string | null
  plansDir: string | null
  onClose: () => void
}

const SOURCE_OPTIONS: Array<{ value: SourceKind; label: string }> = [
  { value: 'prompt', label: 'Prompt' },
  { value: 'idea',   label: 'Idea' },
  { value: 'spec',   label: 'Spec' },
  { value: 'plan',   label: 'Plan' },
]

const TASK_GOALS: Array<{ value: Exclude<SessionGoal, 'brainstorm'>; label: string }> = [
  { value: 'spec',    label: 'Make spec' },
  { value: 'plan',    label: 'Make plan' },
  { value: 'develop', label: 'Start development' },
]

const PROMPT_GOALS: Array<{ value: SessionGoal; label: string }> = [
  { value: 'brainstorm', label: 'Brainstorm' },
  ...TASK_GOALS,
]

const DEFAULT_GOAL: Record<SourceKind, SessionGoal> = {
  prompt: 'brainstorm',
  idea: 'spec',
  spec: 'plan',
  plan: 'develop',
}

const GOAL_TO_STATUS: Partial<Record<SessionGoal, TaskStatus>> = {
  spec: 'speccing',
  plan: 'planning',
  develop: 'developing',
}

function displayFile(value: string | null): string {
  if (!value) return ''
  const withoutScheme = value.startsWith('file://') ? value.slice(7) : value
  return withoutScheme.split('/').pop() ?? withoutScheme
}

function taskFileToSource(value: string | null): string | null {
  if (!value) return null
  const withoutScheme = value.startsWith('file://') ? value.slice(7) : value
  if (withoutScheme.includes('\n')) return null
  if (withoutScheme.startsWith('/') || withoutScheme.startsWith('.') || withoutScheme.includes('/')) {
    return withoutScheme
  }
  return null
}

function sourceFileForTask(task: Task, sourceKind: SourceKind): string | null {
  if (sourceKind === 'idea') return taskFileToSource(task.idea_file)
  if (sourceKind === 'spec') return taskFileToSource(task.spec_file ?? task.idea_file)
  if (sourceKind === 'plan') return taskFileToSource(task.plan_file ?? task.spec_file ?? task.idea_file)
  return null
}

function hasSourceForKind(task: Task, sourceKind: SourceKind): boolean {
  if (sourceKind === 'idea') return task.status === 'idea' || !!task.idea_file
  if (sourceKind === 'spec') return task.status === 'speccing' || !!task.spec_file
  if (sourceKind === 'plan') return task.status === 'planning' || task.status === 'developing' || !!task.plan_file
  return false
}

function absoluteOutputPath(projectPath: string, dir: string | null, title: string): string | undefined {
  if (!dir) return undefined
  const date = new Date().toISOString().split('T')[0]
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const cleanDir = dir.replace(/\/+$/, '')
  const base = cleanDir.startsWith('/') ? cleanDir : `${projectPath.replace(/\/+$/, '')}/${cleanDir}`
  return `${base}/${date}-${slug || 'session'}.md`
}

export function StartSessionModal({ projectId, projectPath, specsDir, plansDir, onClose }: Props) {
  const { tasks } = useTasks(projectId)
  const launchSession = useLaunchSession()
  const [sourceKind, setSourceKind] = useState<SourceKind>('prompt')
  const [goal, setGoal] = useState<SessionGoal>('brainstorm')
  const [taskId, setTaskId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)

  const goals = sourceKind === 'prompt' ? PROMPT_GOALS : TASK_GOALS

  const sourceTasks = useMemo(
    () => tasks.filter((task) => sourceKind !== 'prompt' && hasSourceForKind(task, sourceKind)),
    [sourceKind, tasks]
  )

  const selectedTask = useMemo(
    () => sourceTasks.find((task) => task.id === taskId) ?? null,
    [sourceTasks, taskId]
  )

  useEffect(() => {
    setGoal(DEFAULT_GOAL[sourceKind])
    setTaskId('')
    setError(null)
  }, [sourceKind])

  useEffect(() => {
    if (sourceKind === 'prompt') return
    if (taskId && sourceTasks.some((task) => task.id === taskId)) return
    setTaskId(sourceTasks[0]?.id ?? '')
  }, [sourceKind, sourceTasks, taskId])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const promptRequired = sourceKind === 'prompt'
  const canSubmit = sourceKind === 'prompt'
    ? prompt.trim().length > 0
    : !!selectedTask

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || launchSession.isPending) return
    setError(null)

    const outputPath = selectedTask && goal === 'spec'
      ? absoluteOutputPath(projectPath, specsDir, selectedTask.title)
      : selectedTask && goal === 'plan'
        ? absoluteOutputPath(projectPath, plansDir, selectedTask.title)
        : undefined

    try {
      await launchSession.mutateAsync({
        projectId,
        phase: goal,
        taskId: selectedTask?.id,
        sourceFile: selectedTask ? sourceFileForTask(selectedTask, sourceKind) : null,
        outputPath,
        userContext: prompt.trim(),
        permissionMode: 'default',
      })

      const nextStatus = selectedTask ? GOAL_TO_STATUS[goal] : undefined
      if (selectedTask && nextStatus) {
        await patchTask(selectedTask.id, { status: nextStatus })
      }

      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session')
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[2200]"
      onMouseDown={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="w-[560px] max-w-[92vw] bg-bg-primary border border-border-default rounded-[8px] shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-border-default flex items-center justify-between">
          <div className="text-text-primary text-[14px] font-semibold">Start Session</div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary bg-transparent border-none p-1 cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          <FieldLabel>Start From</FieldLabel>
          <div className="grid grid-cols-4 gap-1 mb-4">
            {SOURCE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSourceKind(option.value)}
                className={`h-8 rounded-[6px] border text-[12px] ${
                  sourceKind === option.value
                    ? 'bg-[#1a2530] border-accent-blue text-accent-blue'
                    : 'bg-bg-secondary border-border-default text-text-secondary hover:text-text-primary'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {sourceKind !== 'prompt' && (
            <div className="mb-4">
              <FieldLabel>{sourceKind}</FieldLabel>
              <select
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                className="w-full bg-bg-secondary border border-border-default rounded-[6px] text-text-primary text-[13px] px-2.5 py-2"
              >
                {sourceTasks.length === 0 && <option value="">No matching tasks</option>}
                {sourceTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}{sourceKind === 'idea' && task.idea_file ? ` · ${displayFile(task.idea_file)}` : ''}
                    {sourceKind === 'spec' && task.spec_file ? ` · ${displayFile(task.spec_file)}` : ''}
                    {sourceKind === 'plan' && task.plan_file ? ` · ${displayFile(task.plan_file)}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <FieldLabel>Goal</FieldLabel>
          <div className={`grid gap-1 mb-4 ${goals.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
            {goals.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setGoal(option.value)}
                className={`h-8 rounded-[6px] border text-[12px] ${
                  goal === option.value
                    ? 'bg-[#0c1a12] border-accent-green text-accent-green'
                    : 'bg-bg-secondary border-border-default text-text-secondary hover:text-text-primary'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <FieldLabel>{promptRequired ? 'Prompt' : 'Additional Prompt'}</FieldLabel>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder={promptRequired ? 'Describe the session...' : 'Optional context for this run...'}
            className="w-full bg-bg-secondary border border-border-default rounded-[6px] px-2.5 py-2 text-text-primary text-[13px] resize-y box-border"
          />

          {error && (
            <div className="mt-3 text-accent-red text-[12px]">{error}</div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-border-default flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="bg-bg-secondary text-text-muted border border-border-default rounded-[6px] px-3.5 py-1.5 text-[12px] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit || launchSession.isPending}
            className="inline-flex items-center gap-1.5 bg-[#0d1a2d] text-accent-blue border border-accent-blue/30 rounded-[6px] px-3.5 py-1.5 text-[12px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play size={13} />
            {launchSession.isPending ? 'Starting...' : 'Start'}
          </button>
        </div>
      </form>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-text-muted text-[10px] uppercase tracking-[0.04em] mb-1.5">
      {children}
    </div>
  )
}
