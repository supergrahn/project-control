import type { TaskPrepStatus } from '@/lib/db/tasks'

// Re-export TaskPrepStatus locally so prep code imports stay self-contained.
// Single source of truth lives in lib/db/tasks.
export type PrepStatus = TaskPrepStatus
export type { TaskPrepStatus }

export type PrepFileEntry = {
  path: string
  why: string
}

export type PrepNotes = {
  summary: string
  intent: string
  files: PrepFileEntry[]
  open_questions: string[]
  generated_at: string
  model: string
}
