import type { TaskStatus, TaskPriority } from '@/lib/db/tasks'
import type { ConfigField, ExternalTask, TaskSourceAdapter } from './types'

/**
 * Map DoneDone status to internal TaskStatus.
 * Uses keyword matching (case-insensitive).
 */
function mapStatus(raw: string): TaskStatus {
  if (!raw) return 'idea'

  const normalized = raw.toLowerCase()

  // done/closed/resolved/fixed/complete → 'done'
  if (
    normalized === 'done' ||
    normalized === 'closed' ||
    normalized === 'resolved' ||
    normalized === 'fixed' ||
    normalized === 'complete'
  ) {
    return 'done'
  }

  // in progress/active/working → 'developing'
  // Note: 'open' alone maps to 'idea', not 'developing'
  if (
    normalized.includes('in progress') ||
    normalized === 'active' ||
    normalized === 'working'
  ) {
    return 'developing'
  }

  // default → 'idea'
  return 'idea'
}

/**
 * Map DoneDone priority to internal TaskPriority.
 * Uses keyword matching (case-insensitive).
 */
function mapPriority(raw: string | null): TaskPriority {
  if (!raw) return 'medium'

  const normalized = raw.toLowerCase()

  // critical/urgent/highest → 'urgent'
  if (
    normalized === 'critical' ||
    normalized === 'urgent' ||
    normalized === 'highest'
  ) {
    return 'urgent'
  }

  // high → 'high'
  if (normalized === 'high') {
    return 'high'
  }

  // medium/normal → 'medium'
  if (normalized === 'medium' || normalized === 'normal') {
    return 'medium'
  }

  // low/lowest → 'low'
  if (normalized === 'low' || normalized === 'lowest') {
    return 'low'
  }

  // default → 'medium'
  return 'medium'
}

/**
 * Fetch available DoneDone projects for resource selection.
 */
async function fetchAvailableResources(
  config: Record<string, string>,
): Promise<{ id: string; name: string }[]> {
  const { subdomain, username, api_key } = config
  if (!subdomain || !username || !api_key) return []

  const baseUrl = `https://${subdomain}.mydonedone.com/issuetracker/api/v2`
  const credentials = Buffer.from(`${username}:${api_key}`).toString('base64')

  const response = await fetch(`${baseUrl}/projects.json`, {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) throw new Error(`DoneDone API error: ${response.status}`)

  const data = (await response.json()) as any
  const projects = Array.isArray(data) ? data : (data.projects ?? [])
  return projects.map((p: any) => ({
    id: String(p.id),
    name: p.name || p.title || String(p.id),
  }))
}

/**
 * DoneDone REST API v2 adapter for fetching tasks.
 * Uses Basic auth with username and API key.
 */
export const donedoneAdapter: TaskSourceAdapter = {
  key: 'donedone',
  name: 'DoneDone',
  resourceSelectionLabel: 'Select projects',

  configFields: [
    {
      key: 'subdomain',
      label: 'Subdomain',
      type: 'text',
      placeholder: 'your-company',
      required: true,
    },
    {
      key: 'username',
      label: 'Username',
      type: 'text',
      required: true,
      helpText: 'Your DoneDone username, not email',
    },
    {
      key: 'api_key',
      label: 'API Key',
      type: 'password',
      required: true,
    },
  ],

  fetchAvailableResources,

  async fetchTasks(config: Record<string, string>, resourceIds: string[]): Promise<ExternalTask[]> {
    const { subdomain, username, api_key } = config

    if (!subdomain || !username || !api_key) {
      throw new Error(
        'Missing required DoneDone configuration: subdomain, username, api_key',
      )
    }

    const baseUrl = `https://${subdomain}.mydonedone.com/issuetracker/api/v2`

    // Create Basic Auth header
    const credentials = Buffer.from(`${username}:${api_key}`).toString('base64')
    const headers = {
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
    }

    // Try primary endpoint: GET /issues/all_yours.json
    let response = await fetch(`${baseUrl}/issues/all_yours.json`, {
      method: 'GET',
      headers,
    })

    // Fallback to secondary endpoint only if primary returns 404 or 405
    if (response.status === 404 || response.status === 405) {
      response = await fetch(`${baseUrl}/issues/all_active.json`, {
        method: 'GET',
        headers,
      })
    }

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `DoneDone API error: ${response.status} ${response.statusText} - ${errorText}`,
      )
    }

    const data = (await response.json()) as any

    if (!Array.isArray(data)) {
      throw new Error('Invalid DoneDone API response: expected array')
    }

    const tasks = data.map((issue: any) => {
      const sourceId = String(issue.id || issue.order_number)
      const issueUrl = `https://${subdomain}.mydonedone.com/issuetracker/issues/${issue.id || issue.order_number}`

      // Handle status: could be nested object with .name or flat string with _name
      const statusStr =
        typeof issue.status === 'object'
          ? issue.status?.name
          : issue.status_name || issue.status || ''

      // Handle priority: could be nested object with .name or flat string with _name
      const priorityStr =
        typeof issue.priority === 'object'
          ? issue.priority?.name
          : issue.priority_name || issue.priority || null

      // Handle labels/tags
      const labels =
        Array.isArray(issue.tags) && issue.tags.length > 0
          ? issue.tags.map((tag: any) =>
              typeof tag === 'object' ? tag.name : tag,
            )
          : []

      // Handle assignees/fixer
      const assignees: string[] = []
      if (issue.fixer) {
        const fixerName =
          typeof issue.fixer === 'object' ? issue.fixer.name : issue.fixer
        if (fixerName) assignees.push(fixerName)
      } else if (issue.fixer_name) {
        assignees.push(issue.fixer_name)
      }

      return {
        sourceId,
        title: issue.title || '(Untitled)',
        description: issue.description || null,
        status: statusStr,
        priority: priorityStr,
        url: issueUrl,
        labels,
        assignees,
        meta: issue,
      } as ExternalTask
    })

    // Filter by selected projects if any are selected
    if (resourceIds.length > 0) {
      return tasks.filter(t => {
        const meta = t.meta as any
        const projectId = String(meta.project_id ?? meta.projectId ?? '')
        return resourceIds.includes(projectId)
      })
    }
    return tasks
  },

  mapStatus,
  mapPriority,
}
