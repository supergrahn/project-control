import type { TaskStatus, TaskPriority } from '@/lib/db/tasks'
import type { ConfigField, ExternalTask, TaskSourceAdapter } from './types'

/**
 * Parse Monday.com people column value to extract user IDs.
 * Monday.com format: { personsAndTeams: [{ id, kind }] }
 */
function extractUserIds(value: string | null | undefined): string[] {
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    // Monday.com format: { personsAndTeams: [{ id, kind }] }
    const persons = parsed?.personsAndTeams || (Array.isArray(parsed) ? parsed : [])
    return persons
      .filter((item) => item && typeof item === 'object' && item.id)
      .map((item) => String(item.id))
  } catch {
    // If JSON parse fails, return empty array
  }

  return []
}

/**
 * Map Monday.com status to internal TaskStatus.
 * Supports English and Norwegian keywords.
 */
function mapStatus(raw: string): TaskStatus {
  if (!raw) return 'idea'

  const normalized = raw.toLowerCase().trim()

  // Done states
  if (/^(done|ferdig|complete|completed|closed)$/.test(normalized)) {
    return 'done'
  }

  // Developing/active states
  if (/^(working|active|in\s+progress|aktiv|in\s+review)$/.test(normalized)) {
    return 'developing'
  }

  // Stuck/blocked states
  if (/^(stuck|waiting|venter|blocked)$/.test(normalized)) {
    return 'idea'
  }

  // Default to idea for anything else
  return 'idea'
}

/**
 * Map Monday.com priority to internal TaskPriority.
 * Supports English and Norwegian keywords.
 */
function mapPriority(raw: string | null): TaskPriority {
  if (!raw) return 'medium'

  const normalized = raw.toLowerCase().trim()

  // Urgent
  if (/^(critical|urgent|kritisk)$/.test(normalized)) {
    return 'urgent'
  }

  // High
  if (/^(high|høy)$/.test(normalized)) {
    return 'high'
  }

  // Medium
  if (/^(medium|middels|normal)$/.test(normalized)) {
    return 'medium'
  }

  // Low
  if (/^(low|lav)$/.test(normalized)) {
    return 'low'
  }

  // Default to medium
  return 'medium'
}

async function fetchAvailableResources(
  config: Record<string, string>,
): Promise<{ id: string; name: string }[]> {
  const { api_token } = config
  if (!api_token) return []

  const response = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: api_token,
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query: '{ boards(limit: 100) { id name } }' }),
  })

  if (!response.ok) throw new Error(`Monday.com API error: ${response.status}`)

  const data = (await response.json()) as { data?: { boards?: { id: string; name: string }[] }; errors?: { message: string }[] }
  if (data.errors?.length) {
    throw new Error(`Monday.com API error: ${data.errors.map(e => e.message).join(', ')}`)
  }
  return (data.data?.boards ?? []).map(b => ({ id: b.id, name: b.name }))
}

async function fetchTasks(
  config: Record<string, string>,
  resourceIds: string[],
): Promise<ExternalTask[]> {
  const { api_token, user_id, subdomain, status_col_id, priority_col_id } = config

  if (!api_token || !user_id || !subdomain) {
    throw new Error('Missing required Monday.com configuration: api_token, user_id, subdomain')
  }
  if (resourceIds.length === 0) throw new Error('No boards selected')
  const boardIdList = resourceIds

  const tasks: ExternalTask[] = []

  // Fetch tasks from each board
  for (const boardId of boardIdList) {
    const boardTasks = await fetchBoardTasks(
      api_token,
      boardId,
      user_id,
      subdomain,
      status_col_id,
      priority_col_id,
    )
    tasks.push(...boardTasks)
  }

  return tasks
}

/**
 * Monday.com GraphQL API adapter for fetching tasks.
 * Requires Monday.com API token and board configuration.
 */
export const mondayAdapter: TaskSourceAdapter = {
  key: 'monday',
  name: 'Monday.com',

  configFields: [
    {
      key: 'api_token',
      label: 'API Token',
      type: 'password',
      required: true,
    },
    {
      key: 'user_id',
      label: 'User ID',
      type: 'text',
      required: true,
      helpText: 'Your Monday.com user ID',
    },
    {
      key: 'subdomain',
      label: 'Subdomain',
      type: 'text',
      required: true,
      helpText: 'Your Monday.com subdomain (e.g., company)',
    },
    {
      key: 'status_col_id',
      label: 'Status Column ID',
      type: 'text',
      required: false,
      helpText: 'Auto-detects if empty',
    },
    {
      key: 'priority_col_id',
      label: 'Priority Column ID',
      type: 'text',
      required: false,
      helpText: 'Auto-detects if empty',
    },
  ],

  resourceSelectionLabel: 'Select boards',
  fetchAvailableResources,
  fetchTasks,
  mapStatus,
  mapPriority,
}

/**
 * Fetch tasks from a single Monday.com board.
 */
async function fetchBoardTasks(
  apiToken: string,
  boardId: string,
  userId: string,
  subdomain: string,
  statusColId: string | undefined,
  priorityColId: string | undefined,
): Promise<ExternalTask[]> {
  const query = `
    query {
      boards(ids: [${boardId}]) {
        name
        items_page(limit: 100) {
          items {
            id
            name
            created_at
            updated_at
            column_values {
              id
              type
              text
              value
            }
            group {
              title
            }
            updates {
              id
              text_body
              created_at
              creator {
                name
              }
            }
          }
        }
        columns {
          id
          title
          type
        }
      }
    }
  `

  const response = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      Authorization: apiToken,
      'API-Version': '2024-10',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Monday.com API error: ${response.status} ${response.statusText} - ${errorText}`,
    )
  }

  const data = (await response.json()) as any

  if (data.errors) {
    throw new Error(`Monday.com GraphQL error: ${JSON.stringify(data.errors)}`)
  }

  if (!data.data || !data.data.boards || data.data.boards.length === 0) {
    return []
  }

  const board = data.data.boards[0]
  const columns = board.columns || []
  const items = board.items_page?.items || []

  // Auto-detect status and priority columns
  const statusColumn = findStatusColumn(columns, statusColId)
  const priorityColumn = findPriorityColumn(columns, priorityColId)

  // Find people columns for user filtering
  const peopleColumnIds = findPeopleColumns(columns)

  // Filter items by user and map to ExternalTask
  return items
    .filter((item: any) => {
      // Check if user is assigned to this item via people columns
      return isUserAssignedToItem(item, peopleColumnIds, userId)
    })
    .map((item: any) => {
      const statusValue = statusColumn
        ? getColumnValue(item, statusColumn.id)
        : null
      const priorityValue = priorityColumn
        ? getColumnValue(item, priorityColumn.id)
        : null
      const assignees = extractAssigneesFromItem(item, peopleColumnIds)

      // Extract description from the first long-text or text column
      const descriptionCol = item.column_values?.find(
        (cv: any) => cv.type === 'long_text' || cv.type === 'text'
      )
      const description = descriptionCol?.text?.trim() || null

      return {
        sourceId: item.id,
        title: item.name || '(Untitled)',
        description,
        status: statusValue || 'new',
        priority: priorityValue,
        url: `https://${subdomain}.monday.com/boards/${boardId}/pulses/${item.id}`,
        labels: item.group?.title ? [item.group.title] : [],
        assignees,
        comments: Array.isArray(item.updates)
          ? item.updates.map((u: any) => ({
              id: String(u.id),
              author: u.creator?.name ?? 'unknown',
              body: u.text_body ?? '',
              createdAt: u.created_at ?? '',
            }))
          : [],
        meta: { ...item, boardName: board.name },
      } as ExternalTask
    })
}

/**
 * Find the status column in a board.
 * Prefers user-provided statusColId, then looks for type 'status'.
 */
function findStatusColumn(columns: any[], statusColId?: string): any {
  if (statusColId) {
    return columns.find((col) => col.id === statusColId)
  }

  return columns.find((col) => col.type === 'status')
}

/**
 * Find the priority column in a board.
 * Prefers user-provided priorityColId, then looks for title matching /priority/i.
 */
function findPriorityColumn(columns: any[], priorityColId?: string): any {
  if (priorityColId) {
    return columns.find((col) => col.id === priorityColId)
  }

  // Look for column with title matching /priority/i
  return columns.find((col) => /priority/i.test(col.title))
}

/**
 * Find all people columns in a board.
 */
function findPeopleColumns(columns: any[]): string[] {
  return columns
    .filter((col) => col.type === 'people' || col.type === 'multiple-person')
    .map((col) => col.id)
}

/**
 * Check if a user is assigned to an item.
 */
function isUserAssignedToItem(
  item: any,
  peopleColumnIds: string[],
  userId: string,
): boolean {
  const columnValues = item.column_values || []

  for (const peopleColId of peopleColumnIds) {
    const columnValue = columnValues.find((cv: any) => cv.id === peopleColId)
    if (columnValue) {
      const userIds = extractUserIds(columnValue.value)
      if (userIds.includes(userId)) {
        return true
      }
    }
  }

  return false
}

/**
 * Get the text value of a column for an item.
 */
function getColumnValue(item: any, columnId: string): string | null {
  const columnValues = item.column_values || []
  const columnValue = columnValues.find((cv: any) => cv.id === columnId)

  if (!columnValue) return null

  // Return text if available, otherwise value
  return columnValue.text || columnValue.value || null
}

/**
 * Extract assignee IDs from all people columns in an item.
 * Monday.com format: { personsAndTeams: [{ id, kind }] }
 */
function extractAssigneesFromItem(item: any, peopleColumnIds: string[]): string[] {
  const assignees: string[] = []
  const columnValues = item.column_values || []

  for (const peopleColId of peopleColumnIds) {
    const columnValue = columnValues.find((cv: any) => cv.id === peopleColId)
    if (columnValue && columnValue.value) {
      try {
        const parsed = JSON.parse(columnValue.value)
        // Monday.com format: { personsAndTeams: [{ id, kind }] }
        const persons = parsed?.personsAndTeams || (Array.isArray(parsed) ? parsed : [])
        for (const person of persons) {
          if (person && person.id) {
            assignees.push(String(person.id))
          }
        }
      } catch {
        // If parse fails, skip
      }
    }
  }

  return assignees
}
