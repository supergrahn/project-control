import type { Database } from 'better-sqlite3'
import { getTask, setTaskComplexity } from '@/lib/db/tasks'
import { getDefaultLocalProvider } from '@/lib/db/providers'
import { localComplete } from './localComplete'
import { COMPLEXITY_PROMPT } from './prompts'
import type { Complexity } from './types'

const VALID: Complexity[] = ['trivial', 'normal', 'hard']

function parseTag(raw: string): Complexity {
  const tok = raw.trim().toLowerCase().split(/\s+/)[0]
  return (VALID as string[]).includes(tok) ? (tok as Complexity) : 'normal'
}

export async function classifyComplexity(
  db: Database,
  taskId: string | undefined,
): Promise<Complexity> {
  if (!taskId) return 'normal'
  const task = getTask(db, taskId)
  if (!task) return 'normal'
  if (task.complexity) return task.complexity

  const local = getDefaultLocalProvider(db)
  if (!local) {
    setTaskComplexity(db, taskId, 'normal', false)
    return 'normal'
  }

  // Use the function-form replacer so user content containing $& / $1 / etc.
  // is treated literally, not as a regex backreference.
  const prompt = COMPLEXITY_PROMPT
    .replace('{title}', () => task.title)
    .replace('{description}', () => task.notes ?? '')

  let tag: Complexity = 'normal'
  try {
    const response = await localComplete(local, prompt, { maxTokens: 10, timeoutMs: 5000 })
    tag = parseTag(response)
  } catch {
    tag = 'normal'
  }

  setTaskComplexity(db, taskId, tag, false)
  return tag
}
