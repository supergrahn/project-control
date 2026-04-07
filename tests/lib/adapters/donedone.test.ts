import { describe, it, expect, vi } from 'vitest'
import { donedoneAdapter } from '@/lib/taskSources/adapters/donedone'

describe('donedoneAdapter', () => {
  it('has correct key, name, resourceSelectionLabel', () => {
    expect(donedoneAdapter.key).toBe('donedone')
    expect(donedoneAdapter.name).toBe('DoneDone')
    expect(donedoneAdapter.resourceSelectionLabel).toBe('Select projects')
  })

  it('configFields has subdomain, username, api_key', () => {
    const keys = donedoneAdapter.configFields.map(f => f.key)
    expect(keys).toContain('subdomain')
    expect(keys).toContain('username')
    expect(keys).toContain('api_key')
  })

  it('fetchAvailableResources returns empty array when credentials missing', async () => {
    expect(await donedoneAdapter.fetchAvailableResources({})).toEqual([])
  })

  it('fetchAvailableResources calls DoneDone projects API', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 1, name: 'Website' },
        { id: 2, name: 'Mobile App' },
      ],
    })
    vi.stubGlobal('fetch', mockFetch)

    const resources = await donedoneAdapter.fetchAvailableResources({
      subdomain: 'myco',
      username: 'user',
      api_key: 'key',
    })
    expect(resources).toEqual([
      { id: '1', name: 'Website' },
      { id: '2', name: 'Mobile App' },
    ])
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('myco.mydonedone.com'),
      expect.any(Object)
    )
    vi.unstubAllGlobals()
  })

  it('fetchTasks filters by resourceIds when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 101, title: 'Task in proj 1', status: 'open', priority: 'medium', project_id: 1 },
        { id: 102, title: 'Task in proj 2', status: 'open', priority: 'low', project_id: 2 },
      ],
    })
    vi.stubGlobal('fetch', mockFetch)

    const tasks = await donedoneAdapter.fetchTasks(
      { subdomain: 'co', username: 'u', api_key: 'k' },
      ['1']
    )
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('Task in proj 1')
    vi.unstubAllGlobals()
  })

  it('fetchTasks returns all tasks when resourceIds empty', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 101, title: 'Task A', status: 'open', priority: 'medium', project_id: 1 },
        { id: 102, title: 'Task B', status: 'open', priority: 'low', project_id: 2 },
      ],
    })
    vi.stubGlobal('fetch', mockFetch)

    const tasks = await donedoneAdapter.fetchTasks(
      { subdomain: 'co', username: 'u', api_key: 'k' },
      []
    )
    expect(tasks).toHaveLength(2)
    vi.unstubAllGlobals()
  })

  it('mapStatus maps correctly', () => {
    expect(donedoneAdapter.mapStatus('done')).toBe('done')
    expect(donedoneAdapter.mapStatus('in progress')).toBe('developing')
    expect(donedoneAdapter.mapStatus('open')).toBe('idea')
  })

  it('mapPriority maps correctly', () => {
    expect(donedoneAdapter.mapPriority('critical')).toBe('urgent')
    expect(donedoneAdapter.mapPriority('high')).toBe('high')
    expect(donedoneAdapter.mapPriority(null)).toBe('medium')
  })
})
