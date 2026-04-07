import { describe, it, expect, beforeEach, vi } from 'vitest'
import { donedoneAdapter } from '../adapters/donedone'

// Mock global fetch
global.fetch = vi.fn()

describe('donedoneAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('adapter metadata', () => {
    it('should have correct key and name', () => {
      expect(donedoneAdapter.key).toBe('donedone')
      expect(donedoneAdapter.name).toBe('DoneDone')
    })

    it('should have required config fields', () => {
      expect(donedoneAdapter.configFields).toHaveLength(3)

      const subdomainField = donedoneAdapter.configFields.find(
        f => f.key === 'subdomain',
      )
      expect(subdomainField).toBeDefined()
      expect(subdomainField?.required).toBe(true)
      expect(subdomainField?.type).toBe('text')
      expect(subdomainField?.placeholder).toBe('your-company')

      const usernameField = donedoneAdapter.configFields.find(
        f => f.key === 'username',
      )
      expect(usernameField).toBeDefined()
      expect(usernameField?.required).toBe(true)
      expect(usernameField?.type).toBe('text')
      expect(usernameField?.helpText).toContain('DoneDone username')

      const apiKeyField = donedoneAdapter.configFields.find(
        f => f.key === 'api_key',
      )
      expect(apiKeyField).toBeDefined()
      expect(apiKeyField?.required).toBe(true)
      expect(apiKeyField?.type).toBe('password')
    })
  })

  describe('fetchTasks', () => {
    it('should throw error if required config is missing', async () => {
      await expect(
        donedoneAdapter.fetchTasks({ username: 'testuser' }, []),
      ).rejects.toThrow('Missing required DoneDone configuration')

      await expect(
        donedoneAdapter.fetchTasks({ subdomain: 'mycompany' }, []),
      ).rejects.toThrow('Missing required DoneDone configuration')

      await expect(
        donedoneAdapter.fetchTasks({
          subdomain: 'mycompany',
          username: 'testuser',
        }, []),
      ).rejects.toThrow('Missing required DoneDone configuration')
    })

    it('should fetch tasks from primary endpoint', async () => {
      const mockResponse = [
        {
          id: 123,
          order_number: 1,
          title: 'Test Issue',
          description: 'Test description',
          status: { name: 'Active' },
          priority: { name: 'High' },
          tags: [{ name: 'bug' }],
          fixer: { name: 'John Doe' },
        },
      ]

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const config = {
        subdomain: 'mycompany',
        username: 'testuser',
        api_key: 'secret123',
      }

      const tasks = await donedoneAdapter.fetchTasks(config, [])

      expect(tasks).toHaveLength(1)
      expect(tasks[0].sourceId).toBe('123')
      expect(tasks[0].title).toBe('Test Issue')

      // Verify primary endpoint was called
      const callUrl = vi.mocked(global.fetch).mock.calls[0][0]
      expect(callUrl).toContain('all_yours.json')
    })

    it('should fallback to secondary endpoint when primary returns 404', async () => {
      const mockResponse = [
        {
          id: 456,
          title: 'Active Issue',
          description: null,
          status_name: 'In Progress',
          priority_name: 'Medium',
          tags: [],
          fixer_name: 'Jane Smith',
        },
      ]

      // First call (primary) returns 404, second call (fallback) succeeds
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: async () => 'Not found',
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        } as Response)

      const config = {
        subdomain: 'mycompany',
        username: 'testuser',
        api_key: 'secret123',
      }

      const tasks = await donedoneAdapter.fetchTasks(config, [])

      expect(tasks).toHaveLength(1)
      expect(tasks[0].sourceId).toBe('456')

      // Verify both endpoints were called
      expect(vi.mocked(global.fetch).mock.calls).toHaveLength(2)
      expect(vi.mocked(global.fetch).mock.calls[0][0]).toContain(
        'all_yours.json',
      )
      expect(vi.mocked(global.fetch).mock.calls[1][0]).toContain(
        'all_active.json',
      )
    })

    it('should map issues to ExternalTask format correctly', async () => {
      const mockResponse = [
        {
          id: 789,
          order_number: 3,
          title: 'Feature Request',
          description: 'Add new feature',
          status: { name: 'Done' },
          priority: { name: 'Urgent' },
          tags: [{ name: 'feature' }, { name: 'frontend' }],
          fixer: { name: 'Alice Johnson' },
        },
      ]

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const config = {
        subdomain: 'mycompany',
        username: 'testuser',
        api_key: 'secret123',
      }

      const tasks = await donedoneAdapter.fetchTasks(config, [])

      expect(tasks[0]).toEqual({
        sourceId: '789',
        title: 'Feature Request',
        description: 'Add new feature',
        status: 'Done',
        priority: 'Urgent',
        url: 'https://mycompany.mydonedone.com/issuetracker/issues/789',
        labels: ['feature', 'frontend'],
        assignees: ['Alice Johnson'],
        meta: mockResponse[0],
      })
    })

    it('should use Basic Auth with username and api_key', async () => {
      const mockResponse: any[] = []

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const config = {
        subdomain: 'mycompany',
        username: 'john',
        api_key: 'myapikey',
      }

      await donedoneAdapter.fetchTasks(config, [])

      const call = vi.mocked(global.fetch).mock.calls[0]
      const headers = call[1]?.headers as Record<string, string>

      expect(headers.Authorization).toBeDefined()
      expect(headers.Authorization).toMatch(/^Basic /)

      // Verify the base64 encoding is correct
      const decoded = Buffer.from(
        headers.Authorization.replace('Basic ', ''),
        'base64',
      ).toString('utf-8')
      expect(decoded).toBe('john:myapikey')
    })

    it('should handle both nested object and flat string status/priority formats', async () => {
      const mockResponse = [
        {
          id: 111,
          title: 'Nested format',
          status: { name: 'Active' },
          priority: { name: 'Low' },
        },
        {
          id: 222,
          title: 'Flat format',
          status_name: 'Done',
          priority_name: 'High',
        },
      ]

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const config = {
        subdomain: 'mycompany',
        username: 'testuser',
        api_key: 'secret123',
      }

      const tasks = await donedoneAdapter.fetchTasks(config, [])

      expect(tasks).toHaveLength(2)
      expect(tasks[0].status).toBe('Active')
      expect(tasks[0].priority).toBe('Low')
      expect(tasks[1].status).toBe('Done')
      expect(tasks[1].priority).toBe('High')
    })

    it('should handle missing optional fields gracefully', async () => {
      const mockResponse = [
        {
          id: 333,
          title: 'Minimal issue',
          // no description, status, priority, tags, fixer
        },
      ]

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const config = {
        subdomain: 'mycompany',
        username: 'testuser',
        api_key: 'secret123',
      }

      const tasks = await donedoneAdapter.fetchTasks(config, [])

      expect(tasks[0].description).toBeNull()
      expect(tasks[0].status).toBe('')
      expect(tasks[0].priority).toBeNull()
      expect(tasks[0].labels).toEqual([])
      expect(tasks[0].assignees).toEqual([])
    })

    it('should use order_number as fallback for sourceId', async () => {
      const mockResponse = [
        {
          order_number: 42,
          title: 'Issue with order number',
        },
      ]

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const config = {
        subdomain: 'mycompany',
        username: 'testuser',
        api_key: 'secret123',
      }

      const tasks = await donedoneAdapter.fetchTasks(config, [])

      expect(tasks[0].sourceId).toBe('42')
      expect(tasks[0].url).toContain('/issues/42')
    })

    it('should handle API errors', async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: async () => 'Primary not found',
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'Server error',
        } as Response)

      const config = {
        subdomain: 'mycompany',
        username: 'testuser',
        api_key: 'secret123',
      }

      await expect(donedoneAdapter.fetchTasks(config, [])).rejects.toThrow(
        'DoneDone API error',
      )
    })

    it('should handle invalid response format', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ issues: [] }), // not an array
      } as Response)

      const config = {
        subdomain: 'mycompany',
        username: 'testuser',
        api_key: 'secret123',
      }

      await expect(donedoneAdapter.fetchTasks(config, [])).rejects.toThrow(
        'Invalid DoneDone API response',
      )
    })

    it('should handle empty response array', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response)

      const config = {
        subdomain: 'mycompany',
        username: 'testuser',
        api_key: 'secret123',
      }

      const tasks = await donedoneAdapter.fetchTasks(config, [])

      expect(tasks).toEqual([])
    })
  })

  describe('mapStatus', () => {
    it('should map done/closed/resolved/fixed/complete to done', () => {
      expect(donedoneAdapter.mapStatus('done')).toBe('done')
      expect(donedoneAdapter.mapStatus('Done')).toBe('done')
      expect(donedoneAdapter.mapStatus('DONE')).toBe('done')

      expect(donedoneAdapter.mapStatus('closed')).toBe('done')
      expect(donedoneAdapter.mapStatus('Closed')).toBe('done')

      expect(donedoneAdapter.mapStatus('resolved')).toBe('done')
      expect(donedoneAdapter.mapStatus('Resolved')).toBe('done')

      expect(donedoneAdapter.mapStatus('fixed')).toBe('done')
      expect(donedoneAdapter.mapStatus('Fixed')).toBe('done')

      expect(donedoneAdapter.mapStatus('complete')).toBe('done')
      expect(donedoneAdapter.mapStatus('Complete')).toBe('done')
    })

    it('should map in progress/active/working to developing', () => {
      expect(donedoneAdapter.mapStatus('in progress')).toBe('developing')
      expect(donedoneAdapter.mapStatus('In Progress')).toBe('developing')
      expect(donedoneAdapter.mapStatus('IN PROGRESS')).toBe('developing')

      expect(donedoneAdapter.mapStatus('active')).toBe('developing')
      expect(donedoneAdapter.mapStatus('Active')).toBe('developing')

      expect(donedoneAdapter.mapStatus('working')).toBe('developing')
      expect(donedoneAdapter.mapStatus('Working')).toBe('developing')
    })

    it('should map open alone to idea (not developing)', () => {
      expect(donedoneAdapter.mapStatus('open')).toBe('idea')
      expect(donedoneAdapter.mapStatus('Open')).toBe('idea')
      expect(donedoneAdapter.mapStatus('OPEN')).toBe('idea')
    })

    it('should map unknown statuses to idea', () => {
      expect(donedoneAdapter.mapStatus('pending')).toBe('idea')
      expect(donedoneAdapter.mapStatus('backlog')).toBe('idea')
      expect(donedoneAdapter.mapStatus('unknown')).toBe('idea')
      expect(donedoneAdapter.mapStatus('')).toBe('idea')
    })
  })

  describe('mapPriority', () => {
    it('should return medium for null priority', () => {
      expect(donedoneAdapter.mapPriority(null)).toBe('medium')
      expect(donedoneAdapter.mapPriority('')).toBe('medium')
    })

    it('should map critical/urgent/highest to urgent', () => {
      expect(donedoneAdapter.mapPriority('critical')).toBe('urgent')
      expect(donedoneAdapter.mapPriority('Critical')).toBe('urgent')
      expect(donedoneAdapter.mapPriority('CRITICAL')).toBe('urgent')

      expect(donedoneAdapter.mapPriority('urgent')).toBe('urgent')
      expect(donedoneAdapter.mapPriority('Urgent')).toBe('urgent')
      expect(donedoneAdapter.mapPriority('URGENT')).toBe('urgent')

      expect(donedoneAdapter.mapPriority('highest')).toBe('urgent')
      expect(donedoneAdapter.mapPriority('Highest')).toBe('urgent')
    })

    it('should map high priority', () => {
      expect(donedoneAdapter.mapPriority('high')).toBe('high')
      expect(donedoneAdapter.mapPriority('High')).toBe('high')
      expect(donedoneAdapter.mapPriority('HIGH')).toBe('high')
    })

    it('should map medium/normal to medium', () => {
      expect(donedoneAdapter.mapPriority('medium')).toBe('medium')
      expect(donedoneAdapter.mapPriority('Medium')).toBe('medium')
      expect(donedoneAdapter.mapPriority('MEDIUM')).toBe('medium')

      expect(donedoneAdapter.mapPriority('normal')).toBe('medium')
      expect(donedoneAdapter.mapPriority('Normal')).toBe('medium')
    })

    it('should map low/lowest to low', () => {
      expect(donedoneAdapter.mapPriority('low')).toBe('low')
      expect(donedoneAdapter.mapPriority('Low')).toBe('low')
      expect(donedoneAdapter.mapPriority('LOW')).toBe('low')

      expect(donedoneAdapter.mapPriority('lowest')).toBe('low')
      expect(donedoneAdapter.mapPriority('Lowest')).toBe('low')
    })

    it('should return medium for unknown priority', () => {
      expect(donedoneAdapter.mapPriority('blocker')).toBe('medium')
      expect(donedoneAdapter.mapPriority('unknown')).toBe('medium')
      expect(donedoneAdapter.mapPriority('P0')).toBe('medium')
    })
  })
})
