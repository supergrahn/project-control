import type { TaskSourceAdapter } from './types'
import { jiraAdapter } from './jira'
import { githubAdapter } from './github'
import { mondayAdapter } from './monday'
import { donedoneAdapter } from './donedone'

const adapters: TaskSourceAdapter[] = [
  jiraAdapter,
  githubAdapter,
  mondayAdapter,
  donedoneAdapter,
]

export function getTaskSourceAdapter(key: string): TaskSourceAdapter {
  const adapter = adapters.find(a => a.key === key)
  if (!adapter) throw new Error(`Unknown task source adapter: ${key}`)
  return adapter
}

export function listTaskSourceAdapters(): TaskSourceAdapter[] {
  return adapters
}
