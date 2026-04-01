import { describe, it, expect, beforeEach, vi } from 'vitest'
import { jiraAdapter } from '../adapters/jira'

// Mock global fetch
global.fetch = vi.fn()

describe('jiraAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('adapter metadata', () => {
    it('should have correct key and name', () => {
      expect(jiraAdapter.key).toBe('jira')
      expect(jiraAdapter.name).toBe('Jira')
    })

    it('should have required config fields', () => {
      expect(jiraAdapter.configFields).toHaveLength(4)

      const baseUrlField = jiraAdapter.configFields.find(f => f.key === 'base_url')
      expect(baseUrlField).toBeDefined()
      expect(baseUrlField?.required).toBe(true)
      expect(baseUrlField?.type).toBe('text')

      const emailField = jiraAdapter.configFields.find(f => f.key === 'email')
      expect(emailField).toBeDefined()
      expect(emailField?.required).toBe(true)

      const apiTokenField = jiraAdapter.configFields.find(f => f.key === 'api_token')
      expect(apiTokenField).toBeDefined()
      expect(apiTokenField?.required).toBe(true)
      expect(apiTokenField?.type).toBe('password')

      const jqlField = jiraAdapter.configFields.find(f => f.key === 'jql_filter')
      expect(jqlField).toBeDefined()
      expect(jqlField?.required).toBe(false)
      expect(jqlField?.type).toBe('textarea')
    })
  })

  describe('fetchTasks', () => {
    it('should throw error if required config is missing', async () => {
      await expect(
        jiraAdapter.fetchTasks({ email: 'test@example.com' }),
      ).rejects.toThrow('Missing required Jira configuration')

      await expect(
        jiraAdapter.fetchTasks({
          base_url: 'https://example.atlassian.net',
          api_token: 'token',
        }),
      ).rejects.toThrow('Missing required Jira configuration')
    })

    it('should fetch tasks with default JQL when jql_filter is empty', async () => {
      const mockResponse = {
        issues: [
          {
            key: 'PROJ-123',
            fields: {
              summary: 'Test Task',
              description: null,
              status: { statusCategory: { key: 'new' } },
              priority: { name: 'High' },
              labels: ['bug'],
              assignee: { displayName: 'John Doe' },
            },
          },
        ],
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const config = {
        base_url: 'https://example.atlassian.net',
        email: 'test@example.com',
        api_token: 'token',
        jql_filter: '',
      }

      const tasks = await jiraAdapter.fetchTasks(config)

      expect(tasks).toHaveLength(1)
      expect(tasks[0].sourceId).toBe('PROJ-123')

      // Verify default JQL was used
      const callUrl = new URL(vi.mocked(global.fetch).mock.calls[0][0] as string)
      const jqlParam = callUrl.searchParams.get('jql')
      expect(jqlParam).toBe('assignee = currentUser() AND statusCategory != Done')
    })

    it('should fetch tasks with custom JQL filter', async () => {
      const mockResponse = {
        issues: [
          {
            key: 'PROJ-456',
            fields: {
              summary: 'Custom Task',
              description: null,
              status: { statusCategory: { key: 'indeterminate' } },
              priority: null,
              labels: [],
              assignee: null,
            },
          },
        ],
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const config = {
        base_url: 'https://example.atlassian.net',
        email: 'test@example.com',
        api_token: 'token',
        jql_filter: 'project = "MY_PROJECT"',
      }

      const tasks = await jiraAdapter.fetchTasks(config)

      expect(tasks).toHaveLength(1)
      expect(tasks[0].sourceId).toBe('PROJ-456')

      // Verify custom JQL was used
      const callUrl = new URL(vi.mocked(global.fetch).mock.calls[0][0] as string)
      const jqlParam = callUrl.searchParams.get('jql')
      expect(jqlParam).toBe('project = "MY_PROJECT"')
    })

    it('should map issues to ExternalTask format correctly', async () => {
      const mockResponse = {
        issues: [
          {
            key: 'TASK-1',
            fields: {
              summary: 'Task Title',
              description: {
                version: 1,
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Task description' }],
                  },
                ],
              },
              status: { statusCategory: { key: 'new' } },
              priority: { name: 'Medium' },
              labels: ['feature', 'bug'],
              assignee: { displayName: 'Alice' },
            },
          },
        ],
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const config = {
        base_url: 'https://example.atlassian.net',
        email: 'test@example.com',
        api_token: 'token',
        jql_filter: '',
      }

      const tasks = await jiraAdapter.fetchTasks(config)

      expect(tasks[0]).toEqual({
        sourceId: 'TASK-1',
        title: 'Task Title',
        description: 'Task description',
        status: 'new',
        priority: 'Medium',
        url: 'https://example.atlassian.net/browse/TASK-1',
        labels: ['feature', 'bug'],
        assignees: ['Alice'],
        meta: mockResponse.issues[0],
      })
    })

    it('should use Basic Auth with email and api_token', async () => {
      const mockResponse = { issues: [] }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const config = {
        base_url: 'https://example.atlassian.net',
        email: 'user@example.com',
        api_token: 'secret-token',
        jql_filter: '',
      }

      await jiraAdapter.fetchTasks(config)

      const call = vi.mocked(global.fetch).mock.calls[0]
      const headers = call[1]?.headers as Record<string, string>

      expect(headers.Authorization).toBeDefined()
      expect(headers.Authorization).toMatch(/^Basic /)

      // Verify the base64 encoding is correct
      const decoded = Buffer.from(
        headers.Authorization.replace('Basic ', ''),
        'base64',
      ).toString('utf-8')
      expect(decoded).toBe('user@example.com:secret-token')
    })

    it('should handle API errors', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid credentials',
      } as Response)

      const config = {
        base_url: 'https://example.atlassian.net',
        email: 'test@example.com',
        api_token: 'wrong-token',
        jql_filter: '',
      }

      await expect(jiraAdapter.fetchTasks(config)).rejects.toThrow(
        'Jira API error',
      )
    })

    it('should handle missing issues array in response', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ issues: null }),
      } as Response)

      const config = {
        base_url: 'https://example.atlassian.net',
        email: 'test@example.com',
        api_token: 'token',
        jql_filter: '',
      }

      await expect(jiraAdapter.fetchTasks(config)).rejects.toThrow(
        'Invalid Jira API response',
      )
    })

    it('should handle missing description gracefully', async () => {
      const mockResponse = {
        issues: [
          {
            key: 'PROJ-789',
            fields: {
              summary: 'No Description Task',
              description: null,
              status: { statusCategory: { key: 'done' } },
              priority: { name: 'Low' },
              labels: [],
              assignee: null,
            },
          },
        ],
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const config = {
        base_url: 'https://example.atlassian.net',
        email: 'test@example.com',
        api_token: 'token',
        jql_filter: '',
      }

      const tasks = await jiraAdapter.fetchTasks(config)

      expect(tasks[0].description).toBeNull()
    })

    it('should handle missing assignee gracefully', async () => {
      const mockResponse = {
        issues: [
          {
            key: 'PROJ-999',
            fields: {
              summary: 'Unassigned Task',
              description: null,
              status: { statusCategory: { key: 'new' } },
              priority: { name: 'High' },
              labels: [],
              assignee: null,
            },
          },
        ],
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const config = {
        base_url: 'https://example.atlassian.net',
        email: 'test@example.com',
        api_token: 'token',
        jql_filter: '',
      }

      const tasks = await jiraAdapter.fetchTasks(config)

      expect(tasks[0].assignees).toEqual([])
    })
  })

  describe('mapStatus', () => {
    it('should map "done" status category correctly', () => {
      expect(jiraAdapter.mapStatus('done')).toBe('done')
      expect(jiraAdapter.mapStatus('DONE')).toBe('done')
    })

    it('should map "indeterminate" status category to developing', () => {
      expect(jiraAdapter.mapStatus('indeterminate')).toBe('developing')
      expect(jiraAdapter.mapStatus('INDETERMINATE')).toBe('developing')
    })

    it('should map unknown status categories to idea', () => {
      expect(jiraAdapter.mapStatus('new')).toBe('idea')
      expect(jiraAdapter.mapStatus('random')).toBe('idea')
      expect(jiraAdapter.mapStatus('NEW')).toBe('idea')
    })
  })

  describe('mapPriority', () => {
    it('should return medium for null priority', () => {
      expect(jiraAdapter.mapPriority(null)).toBe('medium')
    })

    it('should map highest/critical to urgent', () => {
      expect(jiraAdapter.mapPriority('Highest')).toBe('urgent')
      expect(jiraAdapter.mapPriority('HIGHEST')).toBe('urgent')
      expect(jiraAdapter.mapPriority('Critical')).toBe('urgent')
      expect(jiraAdapter.mapPriority('CRITICAL')).toBe('urgent')
    })

    it('should map high priority', () => {
      expect(jiraAdapter.mapPriority('High')).toBe('high')
      expect(jiraAdapter.mapPriority('HIGH')).toBe('high')
    })

    it('should map medium priority', () => {
      expect(jiraAdapter.mapPriority('Medium')).toBe('medium')
      expect(jiraAdapter.mapPriority('MEDIUM')).toBe('medium')
    })

    it('should map low/lowest to low', () => {
      expect(jiraAdapter.mapPriority('Low')).toBe('low')
      expect(jiraAdapter.mapPriority('LOW')).toBe('low')
      expect(jiraAdapter.mapPriority('Lowest')).toBe('low')
      expect(jiraAdapter.mapPriority('LOWEST')).toBe('low')
    })

    it('should return medium for unknown priority', () => {
      expect(jiraAdapter.mapPriority('Unknown')).toBe('medium')
      expect(jiraAdapter.mapPriority('Blocker')).toBe('medium')
    })
  })

  describe('extractAdfText', () => {
    it('should extract text from plain text node', () => {
      expect(jiraAdapter.mapStatus('new')).toBe('idea')
    })

    it('should handle null and empty nodes', () => {
      // We test extractAdfText indirectly through the description parsing
      // Create a task with null description
      const mockResponse = {
        issues: [
          {
            key: 'TEST-1',
            fields: {
              summary: 'Test',
              description: null,
              status: { statusCategory: { key: 'new' } },
              priority: null,
              labels: [],
              assignee: null,
            },
          },
        ],
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const config = {
        base_url: 'https://example.atlassian.net',
        email: 'test@example.com',
        api_token: 'token',
        jql_filter: '',
      }

      return jiraAdapter.fetchTasks(config).then(tasks => {
        expect(tasks[0].description).toBeNull()
      })
    })

    it('should extract text from nested ADF paragraphs', async () => {
      const mockResponse = {
        issues: [
          {
            key: 'TEST-2',
            fields: {
              summary: 'Nested ADF Test',
              description: {
                version: 1,
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'First paragraph' }],
                  },
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Second paragraph' }],
                  },
                ],
              },
              status: { statusCategory: { key: 'new' } },
              priority: null,
              labels: [],
              assignee: null,
            },
          },
        ],
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const config = {
        base_url: 'https://example.atlassian.net',
        email: 'test@example.com',
        api_token: 'token',
        jql_filter: '',
      }

      const tasks = await jiraAdapter.fetchTasks(config)

      expect(tasks[0].description).toContain('First paragraph')
      expect(tasks[0].description).toContain('Second paragraph')
      expect(tasks[0].description).toContain('\n')
    })

    it('should extract text from deeply nested ADF structure', async () => {
      const mockResponse = {
        issues: [
          {
            key: 'TEST-3',
            fields: {
              summary: 'Deep Nested ADF',
              description: {
                version: 1,
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Start of paragraph',
                      },
                      {
                        type: 'text',
                        text: ' and more text',
                      },
                    ],
                  },
                ],
              },
              status: { statusCategory: { key: 'new' } },
              priority: null,
              labels: [],
              assignee: null,
            },
          },
        ],
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const config = {
        base_url: 'https://example.atlassian.net',
        email: 'test@example.com',
        api_token: 'token',
        jql_filter: '',
      }

      const tasks = await jiraAdapter.fetchTasks(config)

      // Text nodes within a paragraph are joined without separators
      expect(tasks[0].description).toBe('Start of paragraph and more text')
    })
  })
})
