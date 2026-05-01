export type PrepFileEntry = {
  path: string
  why: string
}

// Field names use snake_case deliberately so a parsed LLM response casts
// directly to PrepNotes — the prompt templates produce snake_case JSON keys.
//
// `summary`, `intent`, `open_questions` come from PREP_PROMPT (LLM-produced).
// `files` comes from findRelevantFiles → RERANK_PROMPT.
// `generated_at` and `model` are stamped by the orchestrator after the calls.
export type PrepNotes = {
  summary: string
  intent: string
  files: PrepFileEntry[]
  open_questions: string[]
  generated_at: string
  model: string
}
