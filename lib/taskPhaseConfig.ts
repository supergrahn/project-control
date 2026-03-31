import type { TaskStatus } from './db/tasks'

export const STATUS_ORDER: TaskStatus[] = ['idea', 'speccing', 'planning', 'developing', 'done']

export const PHASE_CONFIG: Record<TaskStatus, { label: string; icon: string; color: string; bgColor: string }> = {
  idea:       { label: 'Idea',       icon: '💡', color: '#5b9bd5', bgColor: '#0d1a2d' },
  speccing:   { label: 'Spec',       icon: '📐', color: '#3a8c5c', bgColor: '#0c1a12' },
  planning:   { label: 'Plan',       icon: '📋', color: '#8f77c9', bgColor: '#1a1225' },
  developing: { label: 'Developing', icon: '⚙️', color: '#c97e2a', bgColor: '#160f04' },
  done:       { label: 'Done',       icon: '✓',  color: '#3a8c5c', bgColor: '#0a120a' },
}

// Maps TaskStatus → the session phase values that represent active work in that status
export const STATUS_TO_SESSION_PHASES: Record<TaskStatus, string[]> = {
  idea:       ['ideate', 'brainstorm'],
  speccing:   ['spec'],
  planning:   ['plan'],
  developing: ['develop', 'orchestrator'],
  done:       [],
}
