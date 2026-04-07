import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mondayAdapter } from '../adapters/monday'

// Mock global fetch
global.fetch = vi.fn()

const mockFetch = global.fetch as any

describe('Monday.com Adapter', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  describe('configFields', () => {
    it('should define all required config fields', () => {
      const fieldKeys = mondayAdapter.configFields.map((f) => f.key)
      expect(fieldKeys).toContain('api_token')
      expect(fieldKeys).not.toContain('board_ids')
      expect(fieldKeys).toContain('user_id')
      expect(fieldKeys).toContain('subdomain')
      expect(fieldKeys).toContain('status_col_id')
      expect(fieldKeys).toContain('priority_col_id')
    })

    it('should mark api_token, user_id, subdomain as required', () => {
      const required = mondayAdapter.configFields
        .filter((f) => f.required)
        .map((f) => f.key)
      expect(required).toContain('api_token')
      expect(required).not.toContain('board_ids')
      expect(required).toContain('user_id')
      expect(required).toContain('subdomain')
    })

    it('should mark status_col_id and priority_col_id as optional', () => {
      const optional = mondayAdapter.configFields
        .filter((f) => !f.required)
        .map((f) => f.key)
      expect(optional).toContain('status_col_id')
      expect(optional).toContain('priority_col_id')
    })
  })

  describe('fetchTasks', () => {
    it('should throw if required config is missing', async () => {
      await expect(
        mondayAdapter.fetchTasks({
          user_id: 'user1',
          subdomain: 'company',
          api_token: '',
        }, ['123']),
      ).rejects.toThrow('Missing required Monday.com configuration')
    })

    it('should throw if resourceIds is empty', async () => {
      await expect(
        mondayAdapter.fetchTasks({
          user_id: 'user1',
          subdomain: 'company',
          api_token: 'token',
        }, []),
      ).rejects.toThrow('No boards selected')
    })

    it('should fetch from multiple board IDs correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            boards: [
              {
                items_page: { items: [] },
                columns: [],
              },
            ],
          },
        }),
      })

      await mondayAdapter.fetchTasks({
        user_id: 'user1',
        subdomain: 'company',
        api_token: 'token',
      }, ['123', '456', '789'])

      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('should call Monday.com API with correct headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            boards: [
              {
                items_page: { items: [] },
                columns: [],
              },
            ],
          },
        }),
      })

      await mondayAdapter.fetchTasks({
        user_id: 'user1',
        subdomain: 'company',
        api_token: 'test-token',
      }, ['123'])

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.monday.com/v2',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'test-token',
            'API-Version': '2024-10',
            'Content-Type': 'application/json',
          }),
        }),
      )
    })

    it('should throw on API error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid token',
      })

      await expect(
        mondayAdapter.fetchTasks({
          user_id: 'user1',
          subdomain: 'company',
          api_token: 'invalid',
        }, ['123']),
      ).rejects.toThrow('Monday.com API error')
    })

    it('should throw on GraphQL error response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          errors: [{ message: 'Invalid query' }],
        }),
      })

      await expect(
        mondayAdapter.fetchTasks({
          user_id: 'user1',
          subdomain: 'company',
          api_token: 'token',
        }, ['123']),
      ).rejects.toThrow('Monday.com GraphQL error')
    })

    it('should filter items by user assignment', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            boards: [
              {
                items_page: {
                  items: [
                    {
                      id: '1',
                      name: 'Task 1',
                      group: { title: 'Group 1' },
                      column_values: [
                        {
                          id: 'people_col',
                          type: 'people',
                          text: 'John Doe',
                          value: JSON.stringify({
                            personsAndTeams: [{ id: 100, kind: 'person' }],
                          }),
                        },
                        {
                          id: 'status_col',
                          type: 'status',
                          text: 'Done',
                          value: 'Done',
                        },
                      ],
                    },
                    {
                      id: '2',
                      name: 'Task 2',
                      group: { title: 'Group 2' },
                      column_values: [
                        {
                          id: 'people_col',
                          type: 'people',
                          text: 'Jane Doe',
                          value: JSON.stringify({
                            personsAndTeams: [{ id: 200, kind: 'person' }],
                          }),
                        },
                      ],
                    },
                  ],
                },
                columns: [
                  { id: 'people_col', title: 'Assignees', type: 'people' },
                  { id: 'status_col', title: 'Status', type: 'status' },
                ],
              },
            ],
          },
        }),
      })

      const tasks = await mondayAdapter.fetchTasks({
        user_id: '100',
        subdomain: 'company',
        api_token: 'token',
      }, ['123'])

      // Only task 1 should be returned (assigned to user 100)
      expect(tasks).toHaveLength(1)
      expect(tasks[0].sourceId).toBe('1')
      expect(tasks[0].title).toBe('Task 1')
    })

    it('should auto-detect status column', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            boards: [
              {
                items_page: {
                  items: [
                    {
                      id: '1',
                      name: 'Task 1',
                      group: { title: 'Group 1' },
                      column_values: [
                        {
                          id: 'people_col',
                          type: 'people',
                          text: 'John',
                          value: JSON.stringify({
                            personsAndTeams: [{ id: 100, kind: 'person' }],
                          }),
                        },
                        {
                          id: 'status_col',
                          type: 'status',
                          text: 'In Progress',
                          value: 'In Progress',
                        },
                      ],
                    },
                  ],
                },
                columns: [
                  { id: 'people_col', title: 'Assignees', type: 'people' },
                  { id: 'status_col', title: 'Status', type: 'status' },
                  { id: 'priority_col', title: 'Priority', type: 'status' },
                ],
              },
            ],
          },
        }),
      })

      const tasks = await mondayAdapter.fetchTasks({
        user_id: '100',
        subdomain: 'company',
        api_token: 'token',
      }, ['123'])

      expect(tasks).toHaveLength(1)
      expect(tasks[0].status).toBe('In Progress')
    })

    it('should use provided status_col_id override', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            boards: [
              {
                items_page: {
                  items: [
                    {
                      id: '1',
                      name: 'Task 1',
                      group: null,
                      column_values: [
                        {
                          id: 'people_col',
                          type: 'people',
                          text: 'John',
                          value: JSON.stringify({
                            personsAndTeams: [{ id: 100, kind: 'person' }],
                          }),
                        },
                        {
                          id: 'custom_status',
                          type: 'status',
                          text: 'Custom Status',
                          value: 'Custom Status',
                        },
                      ],
                    },
                  ],
                },
                columns: [
                  { id: 'people_col', title: 'Assignees', type: 'people' },
                  { id: 'status_col', title: 'Status', type: 'status' },
                  { id: 'custom_status', title: 'Custom', type: 'status' },
                ],
              },
            ],
          },
        }),
      })

      const tasks = await mondayAdapter.fetchTasks({
        user_id: '100',
        subdomain: 'company',
        api_token: 'token',
        status_col_id: 'custom_status',
      }, ['123'])

      expect(tasks).toHaveLength(1)
      expect(tasks[0].status).toBe('Custom Status')
    })

    it('should auto-detect priority column by title', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            boards: [
              {
                items_page: {
                  items: [
                    {
                      id: '1',
                      name: 'Task 1',
                      group: null,
                      column_values: [
                        {
                          id: 'people_col',
                          type: 'people',
                          text: 'John',
                          value: JSON.stringify({
                            personsAndTeams: [{ id: 100, kind: 'person' }],
                          }),
                        },
                        {
                          id: 'priority_col',
                          type: 'status',
                          text: 'High',
                          value: 'High',
                        },
                      ],
                    },
                  ],
                },
                columns: [
                  { id: 'people_col', title: 'Assignees', type: 'people' },
                  { id: 'priority_col', title: 'Priority', type: 'status' },
                ],
              },
            ],
          },
        }),
      })

      const tasks = await mondayAdapter.fetchTasks({
        user_id: '100',
        subdomain: 'company',
        api_token: 'token',
      }, ['123'])

      expect(tasks).toHaveLength(1)
      expect(tasks[0].priority).toBe('High')
    })

    it('should construct correct URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            boards: [
              {
                items_page: {
                  items: [
                    {
                      id: '456',
                      name: 'Task',
                      group: null,
                      column_values: [
                        {
                          id: 'people_col',
                          type: 'people',
                          text: 'John',
                          value: JSON.stringify({
                            personsAndTeams: [{ id: 100, kind: 'person' }],
                          }),
                        },
                      ],
                    },
                  ],
                },
                columns: [
                  { id: 'people_col', title: 'Assignees', type: 'people' },
                ],
              },
            ],
          },
        }),
      })

      const tasks = await mondayAdapter.fetchTasks({
        user_id: '100',
        subdomain: 'acme',
        api_token: 'token',
      }, ['123'])

      expect(tasks[0].url).toBe(
        'https://acme.monday.com/boards/123/pulses/456'
      )
    })

    it('should extract assignees from people columns', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            boards: [
              {
                items_page: {
                  items: [
                    {
                      id: '1',
                      name: 'Task',
                      group: null,
                      column_values: [
                        {
                          id: 'people_col',
                          type: 'people',
                          text: 'John, Jane',
                          value: JSON.stringify({
                            personsAndTeams: [
                              { id: 100, kind: 'person' },
                              { id: 200, kind: 'person' },
                            ],
                          }),
                        },
                      ],
                    },
                  ],
                },
                columns: [
                  { id: 'people_col', title: 'Assignees', type: 'people' },
                ],
              },
            ],
          },
        }),
      })

      const tasks = await mondayAdapter.fetchTasks({
        user_id: '100',
        subdomain: 'company',
        api_token: 'token',
      }, ['123'])

      expect(tasks[0].assignees).toEqual(['100', '200'])
    })

    it('should set labels from group title', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            boards: [
              {
                items_page: {
                  items: [
                    {
                      id: '1',
                      name: 'Task',
                      group: { title: 'Feature' },
                      column_values: [
                        {
                          id: 'people_col',
                          type: 'people',
                          text: 'John',
                          value: JSON.stringify({
                            personsAndTeams: [{ id: 100, kind: 'person' }],
                          }),
                        },
                      ],
                    },
                  ],
                },
                columns: [
                  { id: 'people_col', title: 'Assignees', type: 'people' },
                ],
              },
            ],
          },
        }),
      })

      const tasks = await mondayAdapter.fetchTasks({
        user_id: '100',
        subdomain: 'company',
        api_token: 'token',
      }, ['123'])

      expect(tasks[0].labels).toEqual(['Feature'])
    })

    it('should set empty labels if no group', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            boards: [
              {
                items_page: {
                  items: [
                    {
                      id: '1',
                      name: 'Task',
                      group: null,
                      column_values: [
                        {
                          id: 'people_col',
                          type: 'people',
                          text: 'John',
                          value: JSON.stringify({
                            personsAndTeams: [{ id: 100, kind: 'person' }],
                          }),
                        },
                      ],
                    },
                  ],
                },
                columns: [
                  { id: 'people_col', title: 'Assignees', type: 'people' },
                ],
              },
            ],
          },
        }),
      })

      const tasks = await mondayAdapter.fetchTasks({
        user_id: '100',
        subdomain: 'company',
        api_token: 'token',
      }, ['123'])

      expect(tasks[0].labels).toEqual([])
    })

    it('should return empty array for empty board', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            boards: [
              {
                items_page: { items: [] },
                columns: [],
              },
            ],
          },
        }),
      })

      const tasks = await mondayAdapter.fetchTasks({
        user_id: '100',
        subdomain: 'company',
        api_token: 'token',
      }, ['123'])

      expect(tasks).toEqual([])
    })

    it('should preserve meta with raw item data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            boards: [
              {
                items_page: {
                  items: [
                    {
                      id: '1',
                      name: 'Task',
                      group: null,
                      column_values: [
                        {
                          id: 'people_col',
                          type: 'people',
                          text: 'John',
                          value: JSON.stringify({
                            personsAndTeams: [{ id: 100, kind: 'person' }],
                          }),
                        },
                      ],
                      customField: 'custom value',
                    },
                  ],
                },
                columns: [
                  { id: 'people_col', title: 'Assignees', type: 'people' },
                ],
              },
            ],
          },
        }),
      })

      const tasks = await mondayAdapter.fetchTasks({
        user_id: '100',
        subdomain: 'company',
        api_token: 'token',
      }, ['123'])

      expect(tasks[0].meta).toEqual(expect.objectContaining({
        id: '1',
        name: 'Task',
        customField: 'custom value',
      }))
    })
  })

  describe('mapStatus', () => {
    it('should map done states', () => {
      expect(mondayAdapter.mapStatus('Done')).toBe('done')
      expect(mondayAdapter.mapStatus('done')).toBe('done')
      expect(mondayAdapter.mapStatus('Complete')).toBe('done')
      expect(mondayAdapter.mapStatus('Completed')).toBe('done')
      expect(mondayAdapter.mapStatus('Closed')).toBe('done')
      expect(mondayAdapter.mapStatus('ferdig')).toBe('done')
    })

    it('should map developing states', () => {
      expect(mondayAdapter.mapStatus('Working')).toBe('developing')
      expect(mondayAdapter.mapStatus('Active')).toBe('developing')
      expect(mondayAdapter.mapStatus('In Progress')).toBe('developing')
      expect(mondayAdapter.mapStatus('in progress')).toBe('developing')
      expect(mondayAdapter.mapStatus('In Review')).toBe('developing')
      expect(mondayAdapter.mapStatus('aktiv')).toBe('developing')
    })

    it('should map stuck/blocked states', () => {
      expect(mondayAdapter.mapStatus('Stuck')).toBe('idea')
      expect(mondayAdapter.mapStatus('Waiting')).toBe('idea')
      expect(mondayAdapter.mapStatus('Blocked')).toBe('idea')
      expect(mondayAdapter.mapStatus('venter')).toBe('idea')
    })

    it('should default to idea for unknown states', () => {
      expect(mondayAdapter.mapStatus('Unknown')).toBe('idea')
      expect(mondayAdapter.mapStatus('')).toBe('idea')
      expect(mondayAdapter.mapStatus('Random Status')).toBe('idea')
    })

    it('should handle whitespace', () => {
      expect(mondayAdapter.mapStatus('  Done  ')).toBe('done')
      expect(mondayAdapter.mapStatus('  In Progress  ')).toBe('developing')
    })
  })

  describe('mapPriority', () => {
    it('should map urgent states', () => {
      expect(mondayAdapter.mapPriority('Critical')).toBe('urgent')
      expect(mondayAdapter.mapPriority('Urgent')).toBe('urgent')
      expect(mondayAdapter.mapPriority('kritisk')).toBe('urgent')
    })

    it('should map high priority', () => {
      expect(mondayAdapter.mapPriority('High')).toBe('high')
      expect(mondayAdapter.mapPriority('høy')).toBe('high')
    })

    it('should map medium priority', () => {
      expect(mondayAdapter.mapPriority('Medium')).toBe('medium')
      expect(mondayAdapter.mapPriority('middels')).toBe('medium')
      expect(mondayAdapter.mapPriority('Normal')).toBe('medium')
    })

    it('should map low priority', () => {
      expect(mondayAdapter.mapPriority('Low')).toBe('low')
      expect(mondayAdapter.mapPriority('lav')).toBe('low')
    })

    it('should default to medium for null/empty', () => {
      expect(mondayAdapter.mapPriority(null)).toBe('medium')
      expect(mondayAdapter.mapPriority('')).toBe('medium')
    })

    it('should default to medium for unknown states', () => {
      expect(mondayAdapter.mapPriority('Unknown')).toBe('medium')
      expect(mondayAdapter.mapPriority('Random Priority')).toBe('medium')
    })

    it('should handle whitespace', () => {
      expect(mondayAdapter.mapPriority('  High  ')).toBe('high')
      expect(mondayAdapter.mapPriority('  Critical  ')).toBe('urgent')
    })
  })
})
