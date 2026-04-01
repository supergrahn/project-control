import type { TaskSourceAdapter } from './types'

// Adapters will be imported here as they are created
// import { jiraAdapter } from './jira'
// import { githubAdapter } from './github'
// import { mondayAdapter } from './monday'
// import { donedoneAdapter } from './donedone'

const adapters: TaskSourceAdapter[] = [
  // Will be populated as adapters are implemented
]

export function getTaskSourceAdapter(key: string): TaskSourceAdapter {
  const adapter = adapters.find(a => a.key === key)
  if (!adapter) throw new Error(`Unknown task source adapter: ${key}`)
  return adapter
}

export function listTaskSourceAdapters(): TaskSourceAdapter[] {
  return adapters
}
