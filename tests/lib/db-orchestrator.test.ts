import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  initDb, _resetDbSingleton,
  createOrchestrator, getOrchestratorById, getOrchestratorByProject,
  updateOrchestratorStatus, listOrchestrators,
  createDecision, listDecisions,
  createProposedAction, getProposedActionsForSession, dismissProposedAction, deleteProposedAction,
  updateSessionProgressSteps,
  updateProjectAutomationLevel, getProjectAutomationLevel,
  createProject,
} from '@/lib/db'
import type Database from 'better-sqlite3'

describe('orchestrator data model', () => {
  let db: Database.Database

  beforeEach(() => {
    _resetDbSingleton()
    db = initDb(':memory:')
  })

  afterEach(() => {
    db.close()
    _resetDbSingleton()
  })

  describe('orchestrators', () => {
    it('create and get by id', () => {
      createOrchestrator(db, { id: 'o1', project_id: 'p1', session_id: 's1', status: 'active', created_at: new Date().toISOString(), ended_at: null })
      expect(getOrchestratorById(db, 'o1')?.status).toBe('active')
    })

    it('get by project returns active', () => {
      createOrchestrator(db, { id: 'o2', project_id: 'p2', session_id: 's2', status: 'active', created_at: new Date().toISOString(), ended_at: null })
      expect(getOrchestratorByProject(db, 'p2')?.id).toBe('o2')
    })

    it('update status to ended', () => {
      createOrchestrator(db, { id: 'o3', project_id: 'p3', session_id: 's3', status: 'active', created_at: new Date().toISOString(), ended_at: null })
      updateOrchestratorStatus(db, 'o3', 'ended')
      expect(getOrchestratorById(db, 'o3')?.status).toBe('ended')
      expect(getOrchestratorByProject(db, 'p3')).toBeUndefined()
    })

    it('list returns array', () => {
      expect(Array.isArray(listOrchestrators(db))).toBe(true)
    })
  })

  describe('decisions', () => {
    it('create and list', () => {
      createDecision(db, { id: 'd1', orchestrator_id: 'o1', project_id: 'p1', source_file: null, summary: 'test', detail: null, severity: 'info', created_at: new Date().toISOString() })
      expect(listDecisions(db, { limit: 10 }).some(d => d.id === 'd1')).toBe(true)
    })

    it('filter by projectId', () => {
      createDecision(db, { id: 'd2', orchestrator_id: 'o1', project_id: 'p1', source_file: null, summary: 'a', detail: null, severity: 'warn', created_at: new Date().toISOString() })
      createDecision(db, { id: 'd3', orchestrator_id: 'o1', project_id: 'p2', source_file: null, summary: 'b', detail: null, severity: 'info', created_at: new Date().toISOString() })
      expect(listDecisions(db, { projectId: 'p1', limit: 10 }).every(d => d.project_id === 'p1')).toBe(true)
    })
  })

  describe('proposed actions', () => {
    it('create and get for session', () => {
      createProposedAction(db, { id: 'a1', session_id: 's1', label: 'Advance', action_type: 'advance', payload: null, created_at: new Date().toISOString(), dismissed: 0 })
      expect(getProposedActionsForSession(db, 's1')).toHaveLength(1)
    })

    it('dismiss hides from list', () => {
      createProposedAction(db, { id: 'a2', session_id: 's2', label: 'Skip', action_type: 'skip', payload: null, created_at: new Date().toISOString(), dismissed: 0 })
      dismissProposedAction(db, 'a2')
      expect(getProposedActionsForSession(db, 's2')).toHaveLength(0)
    })

    it('delete removes row', () => {
      createProposedAction(db, { id: 'a3', session_id: 's3', label: 'Archive', action_type: 'archive', payload: null, created_at: new Date().toISOString(), dismissed: 0 })
      deleteProposedAction(db, 'a3')
      expect(getProposedActionsForSession(db, 's3')).toHaveLength(0)
    })
  })

  describe('session progress_steps', () => {
    it('does not throw for missing session', () => {
      expect(() => updateSessionProgressSteps(db, 'no-sess', '[]')).not.toThrow()
    })
  })

  describe('project automation_level', () => {
    it('defaults to checkpoint', () => {
      const pid = createProject(db, { name: 'test', path: '/tmp/test' })
      expect(getProjectAutomationLevel(db, pid)).toBe('checkpoint')
    })

    it('update and get', () => {
      const pid = createProject(db, { name: 'test2', path: '/tmp/test2' })
      updateProjectAutomationLevel(db, pid, 'auto')
      expect(getProjectAutomationLevel(db, pid)).toBe('auto')
    })
  })
})
