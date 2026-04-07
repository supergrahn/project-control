import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import TaskSourceSettings from '@/components/projects/TaskSourceSettings'

const mockAdapters = [
  {
    key: 'github',
    name: 'GitHub Issues',
    configFields: [
      { key: 'token', label: 'Access Token', type: 'password' as const, required: true },
      { key: 'owner', label: 'Owner', type: 'text' as const, required: true },
    ],
    resourceSelectionLabel: 'Select repositories',
  },
  {
    key: 'jira',
    name: 'Jira',
    configFields: [
      { key: 'base_url', label: 'Base URL', type: 'text' as const, required: true },
      { key: 'api_token', label: 'API Token', type: 'password' as const, required: true },
    ],
    resourceSelectionLabel: 'Select projects',
  },
]

const mockGithubConfig = {
  id: 1,
  project_id: 'p1',
  adapter_key: 'github',
  config: { token: '••••••••', owner: 'myorg' },
  resource_ids: ['repo-1', 'repo-2'],
  is_active: true,
  last_synced_at: '2026-04-01T10:00:00Z',
  last_error: null,
}

global.fetch = vi.fn()

function createFetchMocks(configs: unknown[] = []) {
  const mockFetch = vi.mocked(fetch)
  mockFetch.mockImplementation((url: string | Request, options?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url.toString()
    const method = options?.method || 'GET'

    // GET /api/task-sources
    if (urlStr === '/api/task-sources' && method === 'GET') {
      return Promise.resolve({
        ok: true,
        json: async () => mockAdapters,
      } as Response)
    }

    // GET /api/projects/{projectId}/task-source
    if (urlStr.match(/\/api\/projects\/[^/]+\/task-source$/) && method === 'GET') {
      return Promise.resolve({
        ok: true,
        json: async () => configs,
      } as Response)
    }

    // PUT /api/projects/{projectId}/task-source
    if (urlStr.match(/\/api\/projects\/[^/]+\/task-source$/) && method === 'PUT') {
      return Promise.resolve({
        ok: true,
        json: async () => mockGithubConfig,
      } as Response)
    }

    // POST /api/projects/{projectId}/task-source/resources
    if (urlStr.match(/\/api\/projects\/[^/]+\/task-source\/resources$/) && method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ resources: [{ id: 'repo-1', name: 'my-repo' }, { id: 'repo-2', name: 'other-repo' }] }),
      } as Response)
    }

    // POST /api/projects/{projectId}/sync-tasks
    if (urlStr.match(/\/api\/projects\/[^/]+\/sync-tasks$/) && method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ created: 5, updated: 3, deleted: 1 }),
      } as Response)
    }

    // PATCH /api/projects/{projectId}/task-source
    if (urlStr.match(/\/api\/projects\/[^/]+\/task-source$/) && method === 'PATCH') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ ...mockGithubConfig, is_active: false }),
      } as Response)
    }

    // DELETE /api/projects/{projectId}/task-source
    if (urlStr.match(/\/api\/projects\/[^/]+\/task-source/) && method === 'DELETE') {
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      } as Response)
    }

    return Promise.resolve({
      ok: false,
      json: async () => ({ error: 'Not found' }),
    } as Response)
  })

  return mockFetch
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TaskSourceSettings', () => {
  it('shows loading state initially', () => {
    createFetchMocks()
    render(<TaskSourceSettings projectId="p1" />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows all adapters as cards after loading', async () => {
    createFetchMocks()
    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    })

    expect(screen.getByText(/external task sources/i)).toBeInTheDocument()
    expect(screen.getByText('GitHub Issues')).toBeInTheDocument()
    expect(screen.getByText('Jira')).toBeInTheDocument()
  })

  it('shows Set up button for unconfigured adapters', async () => {
    createFetchMocks([])
    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    })

    const setupButtons = screen.getAllByRole('button', { name: /set up/i })
    expect(setupButtons).toHaveLength(2)
  })

  it('clicking Set up expands the adapter card with config form', async () => {
    createFetchMocks([])
    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    })

    const setupButtons = screen.getAllByRole('button', { name: /set up/i })
    fireEvent.click(setupButtons[0])

    expect(screen.getByText(/access token/i)).toBeInTheDocument()
    expect(screen.getByText(/owner/i)).toBeInTheDocument()
  })

  it('Cancel button collapses an unconfigured card back to Set up', async () => {
    createFetchMocks([])
    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    })

    const setupButtons = screen.getAllByRole('button', { name: /set up/i })
    fireEvent.click(setupButtons[0])

    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /set up/i })).toHaveLength(2)
    })
  })

  it('shows configured adapter expanded with Active badge and controls', async () => {
    createFetchMocks([mockGithubConfig])
    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByText(/active/i)).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /sync now/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
  })

  it('shows Paused badge when is_active=false', async () => {
    createFetchMocks([{ ...mockGithubConfig, is_active: false }])
    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByText(/paused/i)).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument()
  })

  it('shows Error badge and message when last_error is set', async () => {
    createFetchMocks([{ ...mockGithubConfig, last_error: 'Authentication failed' }])
    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument()
    })

    expect(screen.getByText(/authentication failed/i)).toBeInTheDocument()
  })

  it('shows last synced timestamp', async () => {
    createFetchMocks([mockGithubConfig])
    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByText(/last synced:/i)).toBeInTheDocument()
    })
  })

  it('shows selected resource_ids as badges in configured view', async () => {
    createFetchMocks([mockGithubConfig])
    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByText('repo-1')).toBeInTheDocument()
      expect(screen.getByText('repo-2')).toBeInTheDocument()
    })
  })

  it('Sync Now button triggers sync and shows results', async () => {
    createFetchMocks([mockGithubConfig])
    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sync now/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /sync now/i }))

    await waitFor(() => {
      expect(screen.getByText(/synced: 5 created, 3 updated, 1 deleted/i)).toBeInTheDocument()
    })
  })

  it('Pause button calls PATCH with is_active=false', async () => {
    const mockFetch = createFetchMocks([mockGithubConfig])
    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /pause/i }))

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/projects/p1/task-source'),
      expect.objectContaining({ method: 'PATCH' })
    )
  })

  it('Edit button enters editing mode showing config form', async () => {
    createFetchMocks([mockGithubConfig])
    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))

    expect(screen.getByText(/access token/i)).toBeInTheDocument()
  })

  it('Cancel in edit mode returns to configured view', async () => {
    createFetchMocks([mockGithubConfig])
    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByText(/access token/i)).toBeInTheDocument()

    // Find the Cancel button in edit mode (not in remove confirm)
    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelButton)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sync now/i })).toBeInTheDocument()
    })
  })

  it('Remove button shows confirmation dialog with adapter name', async () => {
    createFetchMocks([mockGithubConfig])
    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /remove/i }))

    expect(screen.getByText(/remove github issues\?/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm remove/i })).toBeInTheDocument()
  })

  it('Confirm Remove calls DELETE with adapterKey and collapses card', async () => {
    const mockFetch = createFetchMocks([mockGithubConfig])

    // After delete, second GET should return empty array
    let callCount = 0
    mockFetch.mockImplementation((url: string | Request, options?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      const method = options?.method || 'GET'

      if (urlStr === '/api/task-sources' && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => mockAdapters } as Response)
      }

      if (urlStr.match(/\/api\/projects\/[^/]+\/task-source$/) && method === 'GET') {
        callCount++
        const data = callCount === 1 ? [mockGithubConfig] : []
        return Promise.resolve({ ok: true, json: async () => data } as Response)
      }

      if (urlStr.match(/\/api\/projects\/[^/]+\/task-source/) && method === 'DELETE') {
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
      }

      return Promise.resolve({ ok: false, json: async () => ({ error: 'Not found' }) } as Response)
    })

    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /remove/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm remove/i }))

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('adapterKey=github'),
      expect.objectContaining({ method: 'DELETE' })
    )

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /set up/i })).toHaveLength(2)
    })
  })

  it('Cancel in remove confirmation closes dialog', async () => {
    createFetchMocks([mockGithubConfig])
    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(screen.getByText(/remove github issues\?/i)).toBeInTheDocument()

    const cancelButtons = screen.getAllByRole('button', { name: /cancel/i })
    fireEvent.click(cancelButtons[cancelButtons.length - 1])

    expect(screen.queryByText(/remove github issues\?/i)).not.toBeInTheDocument()
  })

  it('multiple adapters configured show both expanded', async () => {
    const jiraConfig = {
      id: 2,
      project_id: 'p1',
      adapter_key: 'jira',
      config: { base_url: 'https://test.atlassian.net', api_token: '••••••••' },
      resource_ids: [],
      is_active: false,
      last_synced_at: null,
      last_error: null,
    }

    createFetchMocks([mockGithubConfig, jiraConfig])
    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByText(/active/i)).toBeInTheDocument()
      expect(screen.getByText(/paused/i)).toBeInTheDocument()
    })

    const syncButtons = screen.getAllByRole('button', { name: /sync now/i })
    expect(syncButtons).toHaveLength(2)
  })

  it('resource picker shows after field blur when resources API returns data', async () => {
    createFetchMocks([])
    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    })

    // Expand github card
    const setupButtons = screen.getAllByRole('button', { name: /set up/i })
    fireEvent.click(setupButtons[0])

    // Fill in required fields and blur
    const inputs = screen.getAllByRole('textbox')
    fireEvent.change(inputs[0], { target: { value: 'myorg' } })
    fireEvent.blur(inputs[0])

    // Also need the password field
    const passwordInputs = document.querySelectorAll('input[type="password"]')
    if (passwordInputs[0]) {
      fireEvent.change(passwordInputs[0], { target: { value: 'mytoken' } })
      fireEvent.blur(passwordInputs[0])
    }

    await waitFor(() => {
      expect(screen.getByText('Select repositories')).toBeInTheDocument()
    })
  })

  it('resource badges are toggleable — clicking selects/deselects', async () => {
    const mockFetch = createFetchMocks([])

    // After fetch resources, return repos
    mockFetch.mockImplementation((url: string | Request, options?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      const method = options?.method || 'GET'

      if (urlStr === '/api/task-sources') {
        return Promise.resolve({ ok: true, json: async () => mockAdapters } as Response)
      }

      if (urlStr.match(/\/api\/projects\/[^/]+\/task-source$/) && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => [] } as Response)
      }

      if (urlStr.match(/\/api\/projects\/[^/]+\/task-source\/resources$/) && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ resources: [{ id: 'repo-1', name: 'my-repo' }] }),
        } as Response)
      }

      return Promise.resolve({ ok: false, json: async () => ({ error: 'Not found' }) } as Response)
    })

    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.queryByText(/^loading$/i)).not.toBeInTheDocument()
    })

    const setupButtons = screen.getAllByRole('button', { name: /set up/i })
    fireEvent.click(setupButtons[0])

    // Trigger resource fetch via blur — blur all visible inputs
    const textInputs = screen.getAllByRole('textbox')
    fireEvent.change(textInputs[0], { target: { value: 'myorg' } })
    fireEvent.blur(textInputs[0])

    const passwordInputs = document.querySelectorAll('input[type="password"]')
    passwordInputs.forEach(input => {
      fireEvent.change(input, { target: { value: 'token123' } })
      fireEvent.blur(input)
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'my-repo' })).toBeInTheDocument()
    })

    const repoBadge = screen.getByRole('button', { name: 'my-repo' })
    expect(repoBadge.className).toContain('bg-bg-secondary')

    fireEvent.click(repoBadge)
    expect(repoBadge.className).toContain('bg-accent-blue')

    fireEvent.click(repoBadge)
    expect(repoBadge.className).toContain('bg-bg-secondary')
  })
})
