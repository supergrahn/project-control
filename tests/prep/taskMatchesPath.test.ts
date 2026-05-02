import { describe, it, expect } from 'vitest'
import { taskMatchesPath } from '@/lib/prep/taskMatchesPath'
import type { Task } from '@/lib/db/tasks'

const baseTask = (overrides: Partial<Task> = {}): Task => ({
  id: 't1', project_id: 'p1', title: 'T', status: 'idea', priority: 'medium',
  idea_file: null, spec_file: null, plan_file: null, session_log: null,
  source: null, source_id: null, source_url: null, source_meta: null,
  labels: null, complexity: null, complexity_overridden: 0,
  prep_notes: null, prep_status: null, prepped_at: null,
  is_deleted: 0, created_at: '', updated_at: '',
  ...overrides,
} as Task)

describe('taskMatchesPath', () => {
  it('matches when idea_file equals path (exact)', () => {
    expect(taskMatchesPath(baseTask({ idea_file: 'specs/foo.md' }), 'specs/foo.md')).toBe(true)
  })
  it('strips file:// prefix from idea_file before comparing', () => {
    expect(taskMatchesPath(baseTask({ idea_file: 'file://specs/foo.md' }), 'specs/foo.md')).toBe(true)
  })
  it('strips ./ from path before comparing', () => {
    expect(taskMatchesPath(baseTask({ idea_file: 'specs/foo.md' }), './specs/foo.md')).toBe(true)
  })
  it('does NOT substring-match', () => {
    expect(taskMatchesPath(baseTask({ idea_file: 'lib/auth.ts' }), 'lib/authorize.ts')).toBe(false)
  })
  it('falls back to prep_notes.files[] when idea_file is null', () => {
    const task = baseTask({
      idea_file: null,
      prep_notes: JSON.stringify({ files: [{ path: 'lib/a.ts', why: 'x' }] }),
    })
    expect(taskMatchesPath(task, 'lib/a.ts')).toBe(true)
  })
  it('returns false when neither idea_file nor prep_notes match', () => {
    expect(taskMatchesPath(baseTask({ idea_file: 'a.md' }), 'b.md')).toBe(false)
  })
})
