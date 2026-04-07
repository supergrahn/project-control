import { describe, it, expect, vi, beforeEach } from 'vitest'
import { githubAdapter } from '@/lib/taskSources/adapters/github'

describe('githubAdapter', () => {
  it('has correct key, name, resourceSelectionLabel', () => {
    expect(githubAdapter.key).toBe('github')
    expect(githubAdapter.name).toBe('GitHub Issues')
    expect(githubAdapter.resourceSelectionLabel).toBe('Select repositories')
  })

  it('configFields has only token, no repos field', () => {
    expect(githubAdapter.configFields).toHaveLength(1)
    expect(githubAdapter.configFields[0].key).toBe('token')
    const keys = githubAdapter.configFields.map(f => f.key)
    expect(keys).not.toContain('repos')
  })

  it('fetchTasks throws when resourceIds is empty', async () => {
    await expect(
      githubAdapter.fetchTasks({ token: 'tok' }, [])
    ).rejects.toThrow('No repositories selected')
  })

  it('fetchAvailableResources returns empty array when no token', async () => {
    const result = await githubAdapter.fetchAvailableResources({})
    expect(result).toEqual([])
  })

  it('mapStatus maps correctly', () => {
    expect(githubAdapter.mapStatus('closed')).toBe('done')
    expect(githubAdapter.mapStatus('in-progress')).toBe('developing')
    expect(githubAdapter.mapStatus('open')).toBe('idea')
  })

  it('mapPriority maps correctly', () => {
    expect(githubAdapter.mapPriority('critical')).toBe('urgent')
    expect(githubAdapter.mapPriority('high')).toBe('high')
    expect(githubAdapter.mapPriority(null)).toBe('medium')
  })

  it('fetchAvailableResources calls GitHub repos API', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { full_name: 'owner/repo1' },
        { full_name: 'owner/repo2' },
      ],
    })
    vi.stubGlobal('fetch', mockFetch)

    const resources = await githubAdapter.fetchAvailableResources({ token: 'mytoken' })
    expect(resources).toEqual([
      { id: 'owner/repo1', name: 'owner/repo1' },
      { id: 'owner/repo2', name: 'owner/repo2' },
    ])
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('api.github.com/user/repos'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer mytoken' }) })
    )

    vi.unstubAllGlobals()
  })

  it('fetchAvailableResources paginates through all repos', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ full_name: `owner/repo${i + 1}` }))
    const page2 = [{ full_name: 'owner/repo101' }, { full_name: 'owner/repo102' }]

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page1 })
      .mockResolvedValueOnce({ ok: true, json: async () => page2 })
    vi.stubGlobal('fetch', mockFetch)

    const resources = await githubAdapter.fetchAvailableResources({ token: 'tok' })
    expect(resources).toHaveLength(102)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch.mock.calls[0][0]).toContain('page=1')
    expect(mockFetch.mock.calls[1][0]).toContain('page=2')

    vi.unstubAllGlobals()
  })

  it('fetchTasks filters issues by resourceIds', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 1,
            number: 42,
            title: 'Bug in repo1',
            body: null,
            state: 'open',
            html_url: 'https://github.com/owner/repo1/issues/42',
            repository_url: 'https://api.github.com/repos/owner/repo1',
            labels: [],
            assignees: [],
          },
          {
            id: 2,
            number: 7,
            title: 'Feature in repo2',
            body: 'desc',
            state: 'open',
            html_url: 'https://github.com/owner/repo2/issues/7',
            repository_url: 'https://api.github.com/repos/owner/repo2',
            labels: [],
            assignees: [],
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const tasks = await githubAdapter.fetchTasks({ token: 'tok' }, ['owner/repo1'])
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('Bug in repo1')
    expect(tasks[0].sourceId).toBe('owner/repo1#42')

    vi.unstubAllGlobals()
  })
})
