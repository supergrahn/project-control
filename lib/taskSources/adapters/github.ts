import type { TaskSourceAdapter, ConfigField, ExternalTask } from './types'

const configFields: ConfigField[] = [
  {
    key: 'token',
    label: 'GitHub Token',
    type: 'password',
    required: true,
    helpText: 'Personal access token with repo scope',
  },
  {
    key: 'repos',
    label: 'Repositories',
    type: 'text',
    placeholder: 'owner/repo, owner/repo2',
    required: true,
    helpText: 'Comma-separated list of repositories to sync',
  },
]

async function fetchTasks(config: Record<string, string>): Promise<ExternalTask[]> {
  const token = config.token
  const reposConfig = config.repos

  if (!token || !reposConfig) {
    throw new Error('Missing required config: token and repos')
  }

  // Parse repos from config
  const repos = reposConfig
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)

  if (repos.length === 0) {
    throw new Error('No valid repositories configured')
  }

  const tasks: ExternalTask[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const url = new URL('https://api.github.com/search/issues')
    url.searchParams.set('q', 'is:open+is:issue+assignee:@me')
    url.searchParams.set('per_page', '100')
    url.searchParams.set('page', String(page))

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!response.ok) {
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`
      )
    }

    const data = (await response.json()) as {
      items: Array<{
        id: number
        number: number
        title: string
        body: string | null
        state: string
        html_url: string
        repository_url: string
        labels: Array<{ name: string }>
        assignees: Array<{ login: string }>
      }>
    }

    if (!data.items || data.items.length === 0) {
      hasMore = false
      break
    }

    // Filter issues by configured repositories
    for (const item of data.items) {
      const isInConfiguredRepo = repos.some((repo) =>
        item.repository_url.endsWith('/' + repo)
      )

      if (!isInConfiguredRepo) {
        continue
      }

      // Extract priority from labels
      const priorityLabel = item.labels.find((l: any) =>
        /^priority[:\s-]/i.test(l.name) ||
        ['critical', 'urgent', 'high', 'medium', 'low', 'normal'].includes(
          l.name.toLowerCase()
        )
      )
      const priority = priorityLabel
        ? priorityLabel.name
            .toLowerCase()
            .replace(/^priority[:\s-]*/i, '')
        : null

      // Check for in-progress status from labels
      const labelNames = item.labels.map((l: any) => l.name.toLowerCase())
      const isInProgress = labelNames.some((l: string) =>
        ['in-progress', 'wip', 'in progress'].includes(l)
      )
      const status =
        item.state === 'closed'
          ? 'closed'
          : isInProgress
            ? 'in-progress'
            : 'open'

      // Construct sourceId for cross-repo uniqueness
      const repoPath = item.repository_url.split('/').slice(-2).join('/')
      const sourceId = `${repoPath}#${item.number}`

      const task: ExternalTask = {
        sourceId,
        title: item.title,
        description: item.body,
        status,
        priority,
        url: item.html_url,
        labels: item.labels.map((l: any) => l.name),
        assignees: item.assignees.map((a: any) => a.login),
        meta: item,
      }

      tasks.push(task)
    }

    // Check if we should continue paginating
    hasMore = data.items.length === 100
    page++
  }

  return tasks
}

function mapStatus(raw: string): 'idea' | 'speccing' | 'planning' | 'developing' | 'done' {
  switch (raw) {
    case 'closed':
      return 'done'
    case 'in-progress':
      return 'developing'
    case 'open':
    default:
      return 'idea'
  }
}

function mapPriority(
  raw: string | null
): 'low' | 'medium' | 'high' | 'urgent' {
  if (!raw) return 'medium'

  const normalized = raw.toLowerCase()

  if (['critical', 'urgent'].includes(normalized)) {
    return 'urgent'
  }
  if (normalized === 'high') {
    return 'high'
  }
  if (['medium', 'normal'].includes(normalized)) {
    return 'medium'
  }
  if (normalized === 'low') {
    return 'low'
  }

  return 'medium'
}

export const githubAdapter: TaskSourceAdapter = {
  key: 'github',
  name: 'GitHub Issues',
  configFields,
  fetchTasks,
  mapStatus,
  mapPriority,
}
