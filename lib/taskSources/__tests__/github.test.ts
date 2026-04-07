import { describe, it, expect, beforeEach, vi } from 'vitest'
import { githubAdapter } from '../adapters/github'

describe('GitHub Issues Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('config fields', () => {
    it('should have token config field', () => {
      expect(githubAdapter.configFields).toHaveLength(1)
      expect(githubAdapter.configFields[0].key).toBe('token')
      expect(githubAdapter.configFields[0].type).toBe('password')
      expect(githubAdapter.configFields[0].required).toBe(true)
    })
  })

  describe('fetchTasks', () => {
    it('should throw error when token is missing', async () => {
      const config = {}
      await expect(githubAdapter.fetchTasks(config, ['owner/repo'])).rejects.toThrow(
        'Missing required config: token'
      )
    })

    it('should throw error when no repositories selected', async () => {
      const config = { token: 'test-token' }
      await expect(githubAdapter.fetchTasks(config, [])).rejects.toThrow(
        'No repositories selected'
      )
    })

    it('should throw error when no valid repositories configured', async () => {
      const config = { token: 'test-token' }
      await expect(githubAdapter.fetchTasks(config, [])).rejects.toThrow(
        'No repositories selected'
      )
    })

    it('should fetch tasks from GitHub API', async () => {
      const mockFetch = vi.fn()
      global.fetch = mockFetch

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 1,
              number: 123,
              title: 'Fix bug',
              body: 'Bug description',
              state: 'open',
              html_url: 'https://github.com/owner/repo/issues/123',
              repository_url: 'https://api.github.com/repos/owner/repo',
              labels: [{ name: 'high' }],
              assignees: [{ login: 'user1' }],
            },
          ],
        }),
      })

      const tasks = await githubAdapter.fetchTasks(
        { token: 'test-token' },
        ['owner/repo'],
      )

      expect(tasks).toHaveLength(1)
      expect(tasks[0].sourceId).toBe('owner/repo#123')
      expect(tasks[0].title).toBe('Fix bug')
      expect(tasks[0].description).toBe('Bug description')
      expect(tasks[0].status).toBe('open')
      expect(tasks[0].priority).toBe('high')
      expect(tasks[0].url).toBe('https://github.com/owner/repo/issues/123')
      expect(tasks[0].labels).toEqual(['high'])
      expect(tasks[0].assignees).toEqual(['user1'])
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.github.com/search/issues'),
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer test-token',
            Accept: 'application/vnd.github.v3+json',
          },
        })
      )
    })

    it('should handle pagination', async () => {
      const mockFetch = vi.fn()
      global.fetch = mockFetch

      // Page 1: 100 items
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: Array.from({ length: 100 }, (_, i) => ({
            id: i + 1,
            number: 100 + i,
            title: `Issue ${100 + i}`,
            body: null,
            state: 'open',
            html_url: `https://github.com/owner/repo/issues/${100 + i}`,
            repository_url: 'https://api.github.com/repos/owner/repo',
            labels: [],
            assignees: [],
          })),
        }),
      })

      // Page 2: 50 items (stops pagination)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: Array.from({ length: 50 }, (_, i) => ({
            id: 100 + i + 1,
            number: 200 + i,
            title: `Issue ${200 + i}`,
            body: null,
            state: 'open',
            html_url: `https://github.com/owner/repo/issues/${200 + i}`,
            repository_url: 'https://api.github.com/repos/owner/repo',
            labels: [],
            assignees: [],
          })),
        }),
      })

      const tasks = await githubAdapter.fetchTasks(
        { token: 'test-token' },
        ['owner/repo'],
      )

      expect(tasks).toHaveLength(150)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should filter issues by configured repositories', async () => {
      const mockFetch = vi.fn()
      global.fetch = mockFetch

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 1,
              number: 123,
              title: 'Issue in repo1',
              body: null,
              state: 'open',
              html_url: 'https://github.com/owner/repo1/issues/123',
              repository_url: 'https://api.github.com/repos/owner/repo1',
              labels: [],
              assignees: [],
            },
            {
              id: 2,
              number: 124,
              title: 'Issue in repo2',
              body: null,
              state: 'open',
              html_url: 'https://github.com/owner/repo2/issues/124',
              repository_url: 'https://api.github.com/repos/owner/repo2',
              labels: [],
              assignees: [],
            },
            {
              id: 3,
              number: 125,
              title: 'Issue in unknown repo',
              body: null,
              state: 'open',
              html_url: 'https://github.com/owner/other-repo/issues/125',
              repository_url: 'https://api.github.com/repos/owner/other-repo',
              labels: [],
              assignees: [],
            },
          ],
        }),
      })

      const tasks = await githubAdapter.fetchTasks(
        { token: 'test-token' },
        ['owner/repo1', 'owner/repo2'],
      )

      expect(tasks).toHaveLength(2)
      expect(tasks[0].sourceId).toBe('owner/repo1#123')
      expect(tasks[1].sourceId).toBe('owner/repo2#124')
    })

    it('should handle API errors', async () => {
      const mockFetch = vi.fn()
      global.fetch = mockFetch

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      })

      await expect(
        githubAdapter.fetchTasks(
          { token: 'invalid-token' },
          ['owner/repo'],
        )
      ).rejects.toThrow('GitHub API error: 401 Unauthorized')
    })

    it('should detect in-progress status from labels', async () => {
      const mockFetch = vi.fn()
      global.fetch = mockFetch

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 1,
              number: 123,
              title: 'Issue with in-progress label',
              body: null,
              state: 'open',
              html_url: 'https://github.com/owner/repo/issues/123',
              repository_url: 'https://api.github.com/repos/owner/repo',
              labels: [{ name: 'in-progress' }],
              assignees: [],
            },
            {
              id: 2,
              number: 124,
              title: 'Issue with wip label',
              body: null,
              state: 'open',
              html_url: 'https://github.com/owner/repo/issues/124',
              repository_url: 'https://api.github.com/repos/owner/repo',
              labels: [{ name: 'wip' }],
              assignees: [],
            },
            {
              id: 3,
              number: 125,
              title: 'Issue with in progress label',
              body: null,
              state: 'open',
              html_url: 'https://github.com/owner/repo/issues/125',
              repository_url: 'https://api.github.com/repos/owner/repo',
              labels: [{ name: 'in progress' }],
              assignees: [],
            },
          ],
        }),
      })

      const tasks = await githubAdapter.fetchTasks(
        { token: 'test-token' },
        ['owner/repo'],
      )

      expect(tasks[0].status).toBe('in-progress')
      expect(tasks[1].status).toBe('in-progress')
      expect(tasks[2].status).toBe('in-progress')
    })

    it('should extract priority from labels', async () => {
      const mockFetch = vi.fn()
      global.fetch = mockFetch

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 1,
              number: 101,
              title: 'Critical issue',
              body: null,
              state: 'open',
              html_url: 'https://github.com/owner/repo/issues/101',
              repository_url: 'https://api.github.com/repos/owner/repo',
              labels: [{ name: 'critical' }],
              assignees: [],
            },
            {
              id: 2,
              number: 102,
              title: 'Priority: high',
              body: null,
              state: 'open',
              html_url: 'https://github.com/owner/repo/issues/102',
              repository_url: 'https://api.github.com/repos/owner/repo',
              labels: [{ name: 'priority: high' }],
              assignees: [],
            },
            {
              id: 3,
              number: 103,
              title: 'No priority',
              body: null,
              state: 'open',
              html_url: 'https://github.com/owner/repo/issues/103',
              repository_url: 'https://api.github.com/repos/owner/repo',
              labels: [],
              assignees: [],
            },
          ],
        }),
      })

      const tasks = await githubAdapter.fetchTasks(
        { token: 'test-token' },
        ['owner/repo'],
      )

      expect(tasks[0].priority).toBe('critical')
      expect(tasks[1].priority).toBe('high')
      expect(tasks[2].priority).toBe(null)
    })
  })

  describe('mapStatus', () => {
    it('should map closed to done', () => {
      expect(githubAdapter.mapStatus('closed')).toBe('done')
    })

    it('should map in-progress to developing', () => {
      expect(githubAdapter.mapStatus('in-progress')).toBe('developing')
    })

    it('should map open to idea', () => {
      expect(githubAdapter.mapStatus('open')).toBe('idea')
    })

    it('should default to idea for unknown status', () => {
      expect(githubAdapter.mapStatus('unknown')).toBe('idea')
    })
  })

  describe('mapPriority', () => {
    it('should map null to medium', () => {
      expect(githubAdapter.mapPriority(null)).toBe('medium')
    })

    it('should map critical to urgent', () => {
      expect(githubAdapter.mapPriority('critical')).toBe('urgent')
    })

    it('should map urgent to urgent', () => {
      expect(githubAdapter.mapPriority('urgent')).toBe('urgent')
    })

    it('should map high to high', () => {
      expect(githubAdapter.mapPriority('high')).toBe('high')
    })

    it('should map medium to medium', () => {
      expect(githubAdapter.mapPriority('medium')).toBe('medium')
    })

    it('should map normal to medium', () => {
      expect(githubAdapter.mapPriority('normal')).toBe('medium')
    })

    it('should map low to low', () => {
      expect(githubAdapter.mapPriority('low')).toBe('low')
    })

    it('should be case-insensitive', () => {
      expect(githubAdapter.mapPriority('CRITICAL')).toBe('urgent')
      expect(githubAdapter.mapPriority('High')).toBe('high')
      expect(githubAdapter.mapPriority('LOW')).toBe('low')
    })

    it('should default to medium for unknown priority', () => {
      expect(githubAdapter.mapPriority('unknown')).toBe('medium')
    })
  })
})
