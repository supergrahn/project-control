import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import TaskSourceSettings from '@/components/projects/TaskSourceSettings'

const mockAdapters = [
  {
    key: 'jira',
    name: 'Jira',
    configFields: [
      { key: 'base_url', label: 'Base URL', type: 'text' as const, required: true },
      { key: 'api_token', label: 'API Token', type: 'password' as const, required: true },
    ],
  },
  { key: 'github', name: 'GitHub Issues', configFields: [] },
]

const mockConfig = {
  project_id: 'p1',
  adapter_key: 'jira',
  config: { base_url: 'https://test.atlassian.net', api_token: '••••••••' },
  is_active: 1,
  last_synced_at: '2026-04-01T10:00:00Z',
  last_error: null,
  created_at: '2026-04-01T09:00:00Z',
}

global.fetch = vi.fn()

function createFetchMocks() {
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
    if (urlStr.includes('/api/projects/') && urlStr.includes('/task-source') && method === 'GET') {
      return Promise.resolve({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      } as Response)
    }

    // PUT /api/projects/{projectId}/task-source
    if (urlStr.includes('/api/projects/') && urlStr.includes('/task-source') && method === 'PUT') {
      return Promise.resolve({
        ok: true,
        json: async () => mockConfig,
      } as Response)
    }

    // POST /api/projects/{projectId}/sync-tasks
    if (urlStr.includes('/api/projects/') && urlStr.includes('/sync-tasks') && method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ created: 5, updated: 3, deleted: 1 }),
      } as Response)
    }

    // PATCH /api/projects/{projectId}/task-source
    if (urlStr.includes('/api/projects/') && urlStr.includes('/task-source') && method === 'PATCH') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ ...mockConfig, is_active: 0 }),
      } as Response)
    }

    // DELETE /api/projects/{projectId}/task-source
    if (urlStr.includes('/api/projects/') && urlStr.includes('/task-source') && method === 'DELETE') {
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
    const mockFetch = createFetchMocks()
    render(<TaskSourceSettings projectId="p1" />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows service picker when no config exists', async () => {
    createFetchMocks()
    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    })

    expect(screen.getByText(/external task source/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /jira/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /github issues/i })).toBeInTheDocument()
  })

  it('clicking adapter button shows config form with adapter name', async () => {
    createFetchMocks()
    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    })

    const jiraButton = screen.getByRole('button', { name: /jira/i })
    fireEvent.click(jiraButton)

    expect(screen.getByText(/configure jira/i)).toBeInTheDocument()
    // Check for Base URL and API Token labels
    expect(screen.getByText(/base url/i)).toBeInTheDocument()
    expect(screen.getByText(/api token/i)).toBeInTheDocument()
  })

  it('shows configured state with adapter name and status badge', async () => {
    const mockFetch = createFetchMocks()
    // Mock the GET task-source to return a config
    mockFetch.mockImplementation((url: string | Request, options?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      const method = options?.method || 'GET'

      if (urlStr === '/api/task-sources' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => mockAdapters,
        } as Response)
      }

      if (urlStr.includes('/api/projects/') && urlStr.includes('/task-source') && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => mockConfig,
        } as Response)
      }

      return Promise.resolve({
        ok: false,
        json: async () => ({ error: 'Not found' }),
      } as Response)
    })

    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByText(/jira/i)).toBeInTheDocument()
    })

    expect(screen.getByText(/jira/i)).toBeInTheDocument()
    expect(screen.getByText(/active/i)).toBeInTheDocument()
  })

  it('shows Active badge when is_active=1', async () => {
    const mockFetch = createFetchMocks()
    mockFetch.mockImplementation((url: string | Request, options?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      const method = options?.method || 'GET'

      if (urlStr === '/api/task-sources') {
        return Promise.resolve({
          ok: true,
          json: async () => mockAdapters,
        } as Response)
      }

      if (urlStr.includes('/api/projects/') && urlStr.includes('/task-source') && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockConfig, is_active: 1 }),
        } as Response)
      }

      return Promise.resolve({
        ok: false,
        json: async () => ({ error: 'Not found' }),
      } as Response)
    })

    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByText(/active/i)).toBeInTheDocument()
    })
  })

  it('shows Paused badge when is_active=0', async () => {
    const mockFetch = createFetchMocks()
    mockFetch.mockImplementation((url: string | Request, options?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      const method = options?.method || 'GET'

      if (urlStr === '/api/task-sources') {
        return Promise.resolve({
          ok: true,
          json: async () => mockAdapters,
        } as Response)
      }

      if (urlStr.includes('/api/projects/') && urlStr.includes('/task-source') && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockConfig, is_active: 0 }),
        } as Response)
      }

      return Promise.resolve({
        ok: false,
        json: async () => ({ error: 'Not found' }),
      } as Response)
    })

    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByText(/paused/i)).toBeInTheDocument()
    })
  })

  it('shows error badge and message when last_error is set', async () => {
    const mockFetch = createFetchMocks()
    const errorConfig = {
      ...mockConfig,
      last_error: 'Authentication failed',
    }

    mockFetch.mockImplementation((url: string | Request, options?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      const method = options?.method || 'GET'

      if (urlStr === '/api/task-sources') {
        return Promise.resolve({
          ok: true,
          json: async () => mockAdapters,
        } as Response)
      }

      if (urlStr.includes('/api/projects/') && urlStr.includes('/task-source') && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => errorConfig,
        } as Response)
      }

      return Promise.resolve({
        ok: false,
        json: async () => ({ error: 'Not found' }),
      } as Response)
    })

    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument()
    })

    expect(screen.getByText(/authentication failed/i)).toBeInTheDocument()
  })

  it('shows last synced timestamp', async () => {
    const mockFetch = createFetchMocks()
    mockFetch.mockImplementation((url: string | Request, options?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      const method = options?.method || 'GET'

      if (urlStr === '/api/task-sources') {
        return Promise.resolve({
          ok: true,
          json: async () => mockAdapters,
        } as Response)
      }

      if (urlStr.includes('/api/projects/') && urlStr.includes('/task-source') && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => mockConfig,
        } as Response)
      }

      return Promise.resolve({
        ok: false,
        json: async () => ({ error: 'Not found' }),
      } as Response)
    })

    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByText(/last synced:/i)).toBeInTheDocument()
    })
  })

  it('Sync Now button triggers sync and shows results', async () => {
    
    const mockFetch = createFetchMocks()
    mockFetch.mockImplementation((url: string | Request, options?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      const method = options?.method || 'GET'

      if (urlStr === '/api/task-sources') {
        return Promise.resolve({
          ok: true,
          json: async () => mockAdapters,
        } as Response)
      }

      if (urlStr.includes('/api/projects/') && urlStr.includes('/task-source') && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => mockConfig,
        } as Response)
      }

      if (urlStr.includes('/sync-tasks') && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ created: 5, updated: 3, deleted: 1 }),
        } as Response)
      }

      return Promise.resolve({
        ok: false,
        json: async () => ({ error: 'Not found' }),
      } as Response)
    })

    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sync now/i })).toBeInTheDocument()
    })

    const syncButton = screen.getByRole('button', { name: /sync now/i })
    fireEvent.click(syncButton)

    await waitFor(() => {
      expect(screen.getByText(/synced: 5 created, 3 updated, 1 deleted/i)).toBeInTheDocument()
    })
  })

  it('Remove button shows confirmation dialog', async () => {
    
    const mockFetch = createFetchMocks()
    mockFetch.mockImplementation((url: string | Request, options?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      const method = options?.method || 'GET'

      if (urlStr === '/api/task-sources') {
        return Promise.resolve({
          ok: true,
          json: async () => mockAdapters,
        } as Response)
      }

      if (urlStr.includes('/api/projects/') && urlStr.includes('/task-source') && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => mockConfig,
        } as Response)
      }

      return Promise.resolve({
        ok: false,
        json: async () => ({ error: 'Not found' }),
      } as Response)
    })

    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
    })

    const removeButton = screen.getByRole('button', { name: /remove/i })
    fireEvent.click(removeButton)

    expect(screen.getByText(/remove this task source/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm remove/i })).toBeInTheDocument()
  })

  it('Confirm Remove button calls DELETE and clears config', async () => {
    
    const mockFetch = createFetchMocks()
    mockFetch.mockImplementation((url: string | Request, options?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      const method = options?.method || 'GET'

      if (urlStr === '/api/task-sources') {
        return Promise.resolve({
          ok: true,
          json: async () => mockAdapters,
        } as Response)
      }

      if (urlStr.includes('/api/projects/') && urlStr.includes('/task-source') && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => mockConfig,
        } as Response)
      }

      if (urlStr.includes('/api/projects/') && urlStr.includes('/task-source') && method === 'DELETE') {
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

    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
    })

    const removeButton = screen.getByRole('button', { name: /remove/i })
    fireEvent.click(removeButton)

    const confirmButton = screen.getByRole('button', { name: /confirm remove/i })
    fireEvent.click(confirmButton)

    // Verify DELETE was called
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/projects/p1/task-source'),
      expect.objectContaining({ method: 'DELETE' })
    )

    // After removal, should show service picker again
    await waitFor(() => {
      expect(screen.getByText(/external task source/i)).toBeInTheDocument()
    })
  })

  it('Cancel button in config form goes back to picker', async () => {
    
    createFetchMocks()
    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    })

    const jiraButton = screen.getByRole('button', { name: /jira/i })
    fireEvent.click(jiraButton)

    expect(screen.getByText(/configure jira/i)).toBeInTheDocument()

    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelButton)

    // Should be back at picker
    expect(screen.getByText(/external task source/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /jira/i })).toBeInTheDocument()
  })

  it('Cancel button in remove confirmation closes dialog', async () => {
    
    const mockFetch = createFetchMocks()
    mockFetch.mockImplementation((url: string | Request, options?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      const method = options?.method || 'GET'

      if (urlStr === '/api/task-sources') {
        return Promise.resolve({
          ok: true,
          json: async () => mockAdapters,
        } as Response)
      }

      if (urlStr.includes('/api/projects/') && urlStr.includes('/task-source') && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => mockConfig,
        } as Response)
      }

      return Promise.resolve({
        ok: false,
        json: async () => ({ error: 'Not found' }),
      } as Response)
    })

    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
    })

    const removeButton = screen.getByRole('button', { name: /remove/i })
    fireEvent.click(removeButton)

    const cancelButton = screen.getAllByRole('button', { name: /cancel/i }).find(btn => btn.textContent === 'Cancel')
    fireEvent.click(cancelButton!)

    expect(screen.queryByText(/remove this task source/i)).not.toBeInTheDocument()
  })

  it('Pause button toggles active state', async () => {
    
    const mockFetch = createFetchMocks()
    mockFetch.mockImplementation((url: string | Request, options?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      const method = options?.method || 'GET'

      if (urlStr === '/api/task-sources') {
        return Promise.resolve({
          ok: true,
          json: async () => mockAdapters,
        } as Response)
      }

      if (urlStr.includes('/api/projects/') && urlStr.includes('/task-source') && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => mockConfig,
        } as Response)
      }

      if (urlStr.includes('/api/projects/') && urlStr.includes('/task-source') && method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockConfig, is_active: 0 }),
        } as Response)
      }

      return Promise.resolve({
        ok: false,
        json: async () => ({ error: 'Not found' }),
      } as Response)
    })

    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByText(/active/i)).toBeInTheDocument()
    })

    const pauseButton = screen.getByRole('button', { name: /pause/i })
    fireEvent.click(pauseButton)

    // Verify PATCH was called
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/projects/p1/task-source'),
      expect.objectContaining({ method: 'PATCH' })
    )
  })

  it('Edit Configuration button enters editing mode', async () => {
    
    const mockFetch = createFetchMocks()
    mockFetch.mockImplementation((url: string | Request, options?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      const method = options?.method || 'GET'

      if (urlStr === '/api/task-sources') {
        return Promise.resolve({
          ok: true,
          json: async () => mockAdapters,
        } as Response)
      }

      if (urlStr.includes('/api/projects/') && urlStr.includes('/task-source') && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => mockConfig,
        } as Response)
      }

      return Promise.resolve({
        ok: false,
        json: async () => ({ error: 'Not found' }),
      } as Response)
    })

    render(<TaskSourceSettings projectId="p1" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit configuration/i })).toBeInTheDocument()
    })

    const editButton = screen.getByRole('button', { name: /edit configuration/i })
    fireEvent.click(editButton)

    expect(screen.getByText(/configure jira/i)).toBeInTheDocument()
  })
})
