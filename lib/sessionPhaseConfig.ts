import type { TaskStatus } from './db/tasks'

export const PHASE_INITIALS: Record<string, string> = {
  ideate:       'ID',
  brainstorm:   'BR',
  spec:         'SP',
  plan:         'PL',
  develop:      'DV',
  orchestrator: 'OR',
}

export const PHASE_TO_STATUS: Record<string, TaskStatus> = {
  ideate:       'idea',
  brainstorm:   'idea',
  spec:         'speccing',
  plan:         'planning',
  develop:      'developing',
  orchestrator: 'developing',
}
