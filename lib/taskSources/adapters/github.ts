import type { TaskSourceAdapter, ConfigField, ExternalTask } from './types'
import type { TaskStatus, TaskPriority } from '@/lib/db/tasks'

const configFields: ConfigField[] = [
  {
    key: 'token',
    label: 'GitHub Token',
    type: 'password',
    required: true,
    helpText: 'Personal access token with repo scope',
  },
]

async function fetchAvailableResources(
  config: Record<string, string>,
): Promise<{ id: string; name: string }[]> {
  const { token } = config
  if (!token) return []

  const repos: { full_name: string }[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const response = await fetch(
      `https://api.github.com/user/repos?per_page=100&sort=updated&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      },
    )

    if (!response.ok) throw new Error(`GitHub API error: ${response.status}`)

    const batch = (await response.json()) as { full_name: string }[]
    repos.push(...batch)
    hasMore = batch.length === 100
    page++
  }

  return repos.map(r => ({ id: r.full_name, name: r.full_name }))
}

async function fetchTasks(
  config: Record<string, string>,
  resourceIds: string[],
): Promise<ExternalTask[]> {
  const token = config.token

  if (!token) throw new Error('Missing required config: token')
  if (resourceIds.length === 0) throw new Error('No repositories selected')

  const tasks: ExternalTask[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const url = new URL('https://api.github.com/search/issues')
    url.searchParams.set('q', 'is:open is:issue assignee:@me')
    url.searchParams.set('per_page', '100')
    url.searchParams.set('page', String(page))

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
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

    for (const item of data.items) {
      const repoPath = item.repository_url.split('/').slice(-2).join('/')
      if (!resourceIds.includes(repoPath)) continue

      const priorityLabel = item.labels.find(l =>
        /^priority[:\s-]/i.test(l.name) ||
        ['critical', 'urgent', 'high', 'medium', 'low', 'normal'].includes(l.name.toLowerCase())
      )
      const priority = priorityLabel
        ? priorityLabel.name.toLowerCase().replace(/^priority[:\s-]*/i, '')
        : null

      const labelNames = item.labels.map(l => l.name.toLowerCase())
      const isInProgress = labelNames.some((l: string) => ['in-progress', 'wip', 'in progress'].includes(l))
      const status = item.state === 'closed' ? 'closed' : isInProgress ? 'in-progress' : 'open'

      const sourceId = `${repoPath}#${item.number}`

      tasks.push({
        sourceId,
        title: item.title,
        description: item.body,
        status,
        priority,
        url: item.html_url,
        labels: item.labels.map(l => l.name),
        assignees: item.assignees.map(a => a.login),
        meta: item,
      })
    }

    hasMore = data.items.length === 100
    page++
  }

  // Fetch comments for each task
  for (const task of tasks) {
    // sourceId format: "owner/repo#number"
    const match = task.sourceId.match(/^(.+)#(\d+)$/)
    if (!match) continue
    const [, repoPath, issueNumber] = match
    try {
      const commentsRes = await fetch(
        `https://api.github.com/repos/${repoPath}/issues/${issueNumber}/comments?per_page=100`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      )
      if (commentsRes.ok) {
        const raw = await commentsRes.json() as Array<{
          id: number
          user: { login: string }
          body: string
          created_at: string
        }>
        task.comments = raw.map(c => ({
          id: String(c.id),
          author: c.user?.login ?? 'unknown',
          body: c.body ?? '',
          createdAt: c.created_at,
        }))
      }
    } catch {
      // Comments are best-effort — don't fail the whole sync
    }
  }

  return tasks
}

function mapStatus(raw: string): TaskStatus {
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

function mapPriority(raw: string | null): TaskPriority {
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
  resourceSelectionLabel: 'Select repositories',
  fetchAvailableResources,
  fetchTasks,
  mapStatus,
  mapPriority,
}
