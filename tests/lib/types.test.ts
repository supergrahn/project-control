import { describe, it, expectTypeOf } from 'vitest'
import type { TaskStatus, TaskPriority } from '@/lib/types'
import type { ExternalTaskStatus } from '@/lib/types'

describe('type exports from lib/types', () => {
  it('TaskStatus is a string union', () => {
    expectTypeOf<TaskStatus>().toEqualTypeOf<'idea' | 'speccing' | 'planning' | 'developing' | 'done'>()
  })
  it('TaskPriority is a string union', () => {
    expectTypeOf<TaskPriority>().toEqualTypeOf<'low' | 'medium' | 'high' | 'urgent'>()
  })
  it('ExternalTaskStatus is accessible from lib/types', () => {
    expectTypeOf<ExternalTaskStatus>().toEqualTypeOf<'todo' | 'inprogress' | 'review' | 'blocked' | 'done'>()
  })
})
