import { describe, it, expect, vi } from 'vitest'
import { mondayAdapter } from '@/lib/taskSources/adapters/monday'

describe('mondayAdapter', () => {
  it('has correct key, name, resourceSelectionLabel', () => {
    expect(mondayAdapter.key).toBe('monday')
    expect(mondayAdapter.name).toBe('Monday.com')
    expect(mondayAdapter.resourceSelectionLabel).toBe('Select boards')
  })

  it('configFields has no board_ids field', () => {
    const keys = mondayAdapter.configFields.map(f => f.key)
    expect(keys).not.toContain('board_ids')
    expect(keys).toContain('api_token')
    expect(keys).toContain('user_id')
    expect(keys).toContain('subdomain')
  })

  it('fetchTasks throws when resourceIds is empty', async () => {
    await expect(
      mondayAdapter.fetchTasks({ api_token: 'tok', user_id: '123', subdomain: 'co' }, [])
    ).rejects.toThrow('No boards selected')
  })

  it('fetchAvailableResources returns empty array when no api_token', async () => {
    const result = await mondayAdapter.fetchAvailableResources({})
    expect(result).toEqual([])
  })

  it('fetchAvailableResources calls monday GraphQL API', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { boards: [{ id: '111', name: 'Sprint Board' }, { id: '222', name: 'Backlog' }] }
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const resources = await mondayAdapter.fetchAvailableResources({ api_token: 'mytoken' })
    expect(resources).toEqual([
      { id: '111', name: 'Sprint Board' },
      { id: '222', name: 'Backlog' },
    ])
    vi.unstubAllGlobals()
  })

  it('mapStatus maps correctly', () => {
    expect(mondayAdapter.mapStatus('done')).toBe('done')
    expect(mondayAdapter.mapStatus('active')).toBe('developing')
    expect(mondayAdapter.mapStatus('stuck')).toBe('idea')
  })

  it('mapPriority maps correctly', () => {
    expect(mondayAdapter.mapPriority('critical')).toBe('urgent')
    expect(mondayAdapter.mapPriority('high')).toBe('high')
    expect(mondayAdapter.mapPriority(null)).toBe('medium')
  })
})
