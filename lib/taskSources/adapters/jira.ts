import type { TaskStatus, TaskPriority } from '@/lib/types'
import type { ConfigField, ExternalTask, TaskSourceAdapter } from './types'

/**
 * Recursively extract text from Atlassian Document Format (ADF) nodes.
 * ADF is a nested JSON tree structure used by Jira for rich text fields.
 */
function extractAdfText(node: any): string {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (node.type === 'text') return node.text || ''
  if (Array.isArray(node.content)) {
    const parts = node.content.map(extractAdfText)
    // Join parts without separator for content within a node
    // But add newline between top-level paragraphs
    return parts.join('')
  }
  return ''
}

/**
 * Extract text from top-level ADF document and preserve paragraph breaks.
 */
function extractAdfDocText(doc: any): string {
  if (!doc || !Array.isArray(doc.content)) {
    return extractAdfText(doc)
  }

  return doc.content
    .map((node: any) => extractAdfText(node))
    .filter((text: string) => text.length > 0)
    .join('\n')
}

/**
 * Map Jira status category to internal TaskStatus.
 * Jira status categories: done, indeterminate, new
 */
function mapStatus(raw: string): TaskStatus {
  switch (raw.toLowerCase()) {
    case 'done':
      return 'done'
    case 'indeterminate':
      return 'developing'
    default:
      return 'idea'
  }
}

/**
 * Map Jira priority to internal TaskPriority.
 * Jira priorities: Highest, High, Medium, Low, Lowest
 */
function mapPriority(raw: string | null): TaskPriority {
  if (!raw) return 'medium'

  const normalized = raw.toLowerCase()

  if (normalized === 'highest' || normalized === 'critical') {
    return 'urgent'
  }
  if (normalized === 'high') {
    return 'high'
  }
  if (normalized === 'medium') {
    return 'medium'
  }
  if (normalized === 'low' || normalized === 'lowest') {
    return 'low'
  }

  return 'medium'
}

const configFields: ConfigField[] = [
  {
    key: 'base_url',
    label: 'Jira URL',
    type: 'text',
    placeholder: 'https://your-domain.atlassian.net',
    required: true,
  },
  {
    key: 'email',
    label: 'Email',
    type: 'text',
    required: true,
  },
  {
    key: 'api_token',
    label: 'API Token',
    type: 'password',
    required: true,
  },
]

async function fetchAvailableResources(
  config: Record<string, string>,
): Promise<{ id: string; name: string }[]> {
  const { base_url, email, api_token } = config
  if (!base_url || !email || !api_token) return []

  const credentials = Buffer.from(`${email}:${api_token}`).toString('base64')
  const response = await fetch(`${base_url}/rest/api/3/project`, {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) throw new Error(`Jira API error: ${response.status}`)

  const raw = await response.json()
  const projects = Array.isArray(raw) ? raw : ((raw as { values?: { key: string; name: string }[] }).values ?? [])
  return (projects as { key: string; name: string }[]).map(p => ({ id: p.key, name: p.name }))
}

/**
 * Jira REST API v3 adapter for fetching tasks.
 * Requires Jira Cloud instance with API token authentication.
 */
export const jiraAdapter: TaskSourceAdapter = {
  key: 'jira',
  name: 'Jira',

  configFields,

  resourceSelectionLabel: 'Select projects',
  fetchAvailableResources,

  async fetchTasks(config: Record<string, string>, resourceIds: string[] = []): Promise<ExternalTask[]> {
    const { base_url, email, api_token } = config

    if (!base_url || !email || !api_token) {
      throw new Error('Missing required Jira configuration: base_url, email, api_token')
    }

    let jql = 'assignee = currentUser() AND statusCategory != Done'
    if (resourceIds.length > 0) {
      const keys = resourceIds.map(k => `"${k}"`).join(', ')
      jql = `project in (${keys}) AND assignee = currentUser() AND statusCategory != Done`
    }

    // Create Basic Auth header
    const credentials = Buffer.from(`${email}:${api_token}`).toString('base64')

    const searchUrl = new URL(`${base_url}/rest/api/3/search/jql`)
    searchUrl.searchParams.set('jql', jql)
    searchUrl.searchParams.set('maxResults', '100')

    const response = await fetch(searchUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `Jira API error: ${response.status} ${response.statusText} - ${errorText}`,
      )
    }

    const data = await response.json() as any

    if (!data.issues || !Array.isArray(data.issues)) {
      throw new Error('Invalid Jira API response: missing issues array')
    }

    const tasks: ExternalTask[] = data.issues.map((issue: any) => {
      const fields = issue.fields || {}
      const statusCategory = fields.status?.statusCategory?.key || 'new'
      const priorityName = fields.priority?.name || null
      return {
        sourceId: issue.key,
        title: fields.summary || '(Untitled)',
        description: fields.description ? extractAdfDocText(fields.description) : null,
        status: statusCategory,
        priority: priorityName,
        url: `${base_url}/browse/${issue.key}`,
        labels: fields.labels || [],
        assignees: fields.assignee?.displayName ? [fields.assignee.displayName] : [],
        meta: issue,
      } as ExternalTask
    })

    // Fetch comments for each issue in parallel (best-effort, first 100 per issue)
    await Promise.all(tasks.map(async (task) => {
      try {
        const commentsRes = await fetch(
          `${base_url}/rest/api/3/issue/${task.sourceId}/comment?maxResults=100`,
          {
            headers: {
              Authorization: `Basic ${credentials}`,
              Accept: 'application/json',
            },
          }
        )
        if (commentsRes.ok) {
          const commentsData = await commentsRes.json() as any
          task.comments = (commentsData.comments ?? []).map((c: any) => ({
            id: String(c.id),
            author: c.author?.displayName ?? 'unknown',
            body: c.body ? extractAdfDocText(c.body) : '',
            createdAt: c.created ?? '',
          }))
        }
      } catch {
        // Best-effort
      }
    }))

    return tasks
  },

  mapStatus,
  mapPriority,
}
