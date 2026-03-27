// lib/orchestrator-types.ts

export type AutomationLevel = 'manual' | 'checkpoint' | 'auto'
export type OrchestratorStatus = 'active' | 'idle' | 'ended'
export type DecisionSeverity = 'info' | 'warn' | 'override'
export type ProposedActionType = 'advance' | 'run_audit' | 'skip' | 'archive' | 'custom'

export interface Orchestrator {
  id: string
  project_id: string
  session_id: string
  status: OrchestratorStatus
  created_at: string
  ended_at: string | null
}

export interface OrchestratorDecision {
  id: string
  orchestrator_id: string
  project_id: string
  source_file: string | null
  summary: string
  detail: string | null
  severity: DecisionSeverity
  created_at: string
}

export interface SessionProposedAction {
  id: string
  session_id: string
  label: string
  action_type: ProposedActionType
  payload: string | null
  created_at: string
  dismissed: number // 0 | 1
}
