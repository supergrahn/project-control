import { describe, it, expect, vi } from 'vitest'
import { jiraAdapter } from '@/lib/taskSources/adapters/jira'

describe('jiraAdapter', () => {
  it('has correct key, name, resourceSelectionLabel', () => {
    expect(jiraAdapter.key).toBe('jira')
    expect(jiraAdapter.name).toBe('Jira')
    expect(jiraAdapter.resourceSelectionLabel).toBe('Select projects')
  })

  it('configFields has no jql_filter field', () => {
    const keys = jiraAdapter.configFields.map(f => f.key)
    expect(keys).not.toContain('jql_filter')
    expect(keys).toContain('base_url')
    expect(keys).toContain('email')
    expect(keys).toContain('api_token')
  })

  it('fetchAvailableResources returns empty array when credentials missing', async () => {
    expect(await jiraAdapter.fetchAvailableResources({})).toEqual([])
    expect(await jiraAdapter.fetchAvailableResources({ base_url: 'https://x.atlassian.net' })).toEqual([])
  })

  it('fetchAvailableResources calls Jira projects API', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { key: 'PROJ', name: 'My Project' },
        { key: 'INFRA', name: 'Infrastructure' },
      ],
    })
    vi.stubGlobal('fetch', mockFetch)

    const resources = await jiraAdapter.fetchAvailableResources({
      base_url: 'https://co.atlassian.net',
      email: 'a@b.com',
      api_token: 'tok',
    })
    expect(resources).toEqual([
      { id: 'PROJ', name: 'My Project' },
      { id: 'INFRA', name: 'Infrastructure' },
    ])
    vi.unstubAllGlobals()
  })

  it('fetchTasks uses default JQL when no resourceIds', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ issues: [], total: 0, maxResults: 100 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await jiraAdapter.fetchTasks(
      { base_url: 'https://co.atlassian.net', email: 'a@b.com', api_token: 'tok' },
      []
    )

    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain('assignee+%3D+currentUser')
    expect(calledUrl).not.toContain('project+in')
    vi.unstubAllGlobals()
  })

  it('fetchTasks uses project-filtered JQL when resourceIds provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ issues: [], total: 0, maxResults: 100 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await jiraAdapter.fetchTasks(
      { base_url: 'https://co.atlassian.net', email: 'a@b.com', api_token: 'tok' },
      ['PROJ', 'INFRA']
    )

    const calledUrl = decodeURIComponent((mockFetch.mock.calls[0][0] as string).replace(/\+/g, ' '))
    expect(calledUrl).toContain('project in')
    expect(calledUrl).toContain('"PROJ"')
    expect(calledUrl).toContain('"INFRA"')
    vi.unstubAllGlobals()
  })

  it('mapStatus maps Jira status categories', () => {
    expect(jiraAdapter.mapStatus('done')).toBe('done')
    expect(jiraAdapter.mapStatus('indeterminate')).toBe('developing')
    expect(jiraAdapter.mapStatus('new')).toBe('idea')
  })

  it('mapPriority maps Jira priorities', () => {
    expect(jiraAdapter.mapPriority('highest')).toBe('urgent')
    expect(jiraAdapter.mapPriority('high')).toBe('high')
    expect(jiraAdapter.mapPriority('medium')).toBe('medium')
    expect(jiraAdapter.mapPriority('low')).toBe('low')
    expect(jiraAdapter.mapPriority(null)).toBe('medium')
  })
})
