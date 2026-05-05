// lib/briefing/__tests__/sectionSignature.test.ts
import { describe, it, expect } from 'vitest'
import { sectionSignature } from '../sectionSignature'
import type { BriefingSections } from '../sectionSignature'
import type { BriefingNextAction, BriefingCriticFlag, BriefingTopTask, BriefingRecentFailure, BriefingDuplicate } from '../types'

function makeNextAction(sessionId: string, sessionLabel = 'label'): BriefingNextAction {
  return {
    sessionId,
    sessionLabel,
    projectId: 'proj-1',
    projectName: 'Project 1',
    taskId: null,
    sourceFile: null,
    endedAt: '2026-05-01T00:00:00.000Z',
    actions: ['do something'],
    openQuestions: [],
  }
}

function makeCriticFlag(findingId: number, ref = 'ref-1', message = 'some issue'): BriefingCriticFlag {
  return {
    findingId,
    projectId: 'proj-1',
    projectName: 'Project 1',
    kind: 'lint',
    ref,
    severity: 'high',
    category: 'quality',
    message,
    createdAt: '2026-05-01T00:00:00.000Z',
  }
}

function makeTopTask(taskId: string): BriefingTopTask {
  return {
    taskId,
    projectId: 'proj-1',
    projectName: 'Project 1',
    title: 'Some task',
    status: 'open',
    createdAt: '2026-05-01T00:00:00.000Z',
  }
}

function makeRecentFailure(sessionId: string): BriefingRecentFailure {
  return {
    sessionId,
    sessionLabel: 'failed session',
    projectId: 'proj-1',
    projectName: 'Project 1',
    grade: 'no',
    gradeReason: 'did not work',
    gradedAt: '2026-05-01T00:00:00.000Z',
  }
}

function makeDuplicate(aTaskId: string, bTaskId: string): BriefingDuplicate {
  return {
    aTaskId,
    bTaskId,
    aTitle: 'Task A',
    bTitle: 'Task B',
    projectId: 'proj-1',
    projectName: 'Project 1',
    similarity: 0.9,
  }
}

function emptySections(): BriefingSections {
  return {
    openNextActions: [],
    criticFlagged: [],
    topTasks: [],
    recentFailures: [],
    duplicateTasks: [],
  }
}

describe('sectionSignature', () => {
  it('same item set in different orders produces the same hash', () => {
    const a: BriefingSections = {
      openNextActions: [makeNextAction('s1'), makeNextAction('s2')],
      criticFlagged: [],
      topTasks: [makeTopTask('t1'), makeTopTask('t2')],
      recentFailures: [],
      duplicateTasks: [],
    }
    const b: BriefingSections = {
      openNextActions: [makeNextAction('s2'), makeNextAction('s1')],
      criticFlagged: [],
      topTasks: [makeTopTask('t2'), makeTopTask('t1')],
      recentFailures: [],
      duplicateTasks: [],
    }
    expect(sectionSignature(a)).toBe(sectionSignature(b))
  })

  it('different item sets produce different hashes', () => {
    const a: BriefingSections = {
      ...emptySections(),
      openNextActions: [makeNextAction('s1')],
    }
    const b: BriefingSections = {
      ...emptySections(),
      openNextActions: [makeNextAction('s2')],
    }
    expect(sectionSignature(a)).not.toBe(sectionSignature(b))
  })

  it('empty sections produce a stable, deterministic hash', () => {
    const s = emptySections()
    const hash1 = sectionSignature(s)
    const hash2 = sectionSignature(s)
    expect(hash1).toBe(hash2)
    expect(typeof hash1).toBe('string')
    expect(hash1.length).toBe(64) // SHA-256 hex
  })

  it('adding one item changes the hash', () => {
    const base = emptySections()
    const withExtra: BriefingSections = {
      ...base,
      topTasks: [makeTopTask('t-new')],
    }
    expect(sectionSignature(base)).not.toBe(sectionSignature(withExtra))
  })

  it('changing a volatile field like sessionLabel does NOT change the hash', () => {
    const sectionA: BriefingSections = {
      ...emptySections(),
      openNextActions: [makeNextAction('s1', 'original label')],
    }
    const sectionB: BriefingSections = {
      ...emptySections(),
      openNextActions: [makeNextAction('s1', 'completely different label')],
    }
    expect(sectionSignature(sectionA)).toBe(sectionSignature(sectionB))
  })

  it('all five section types contribute to the hash independently', () => {
    const base = emptySections()
    const withNext: BriefingSections = { ...base, openNextActions: [makeNextAction('s1')] }
    const withCritic: BriefingSections = { ...base, criticFlagged: [makeCriticFlag(1)] }
    const withTop: BriefingSections = { ...base, topTasks: [makeTopTask('t1')] }
    const withFail: BriefingSections = { ...base, recentFailures: [makeRecentFailure('f1')] }
    const withDup: BriefingSections = { ...base, duplicateTasks: [makeDuplicate('a1', 'b1')] }
    const hashes = new Set([
      sectionSignature(base),
      sectionSignature(withNext),
      sectionSignature(withCritic),
      sectionSignature(withTop),
      sectionSignature(withFail),
      sectionSignature(withDup),
    ])
    expect(hashes.size).toBe(6)
  })
})
