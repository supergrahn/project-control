import { describe, it, expect } from 'vitest'
import { parseAdapterErrors } from '@/lib/externalTasks/errorHints'

describe('parseAdapterErrors', () => {
  it('returns empty array for empty input', () => {
    expect(parseAdapterErrors([])).toEqual([])
  })

  it('parses source and message from colon-separated string', () => {
    const result = parseAdapterErrors(['jira: something went wrong'])
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('jira')
    expect(result[0].message).toBe('something went wrong')
  })

  it('uses Unknown source when no colon present', () => {
    const result = parseAdapterErrors(['something went wrong'])
    expect(result[0].source).toBe('Unknown')
    expect(result[0].message).toBe('something went wrong')
  })

  it('trims whitespace from source and message', () => {
    const result = parseAdapterErrors(['  monday  :  board not found  '])
    expect(result[0].source).toBe('monday')
    expect(result[0].message).toBe('board not found')
  })

  describe('hint generation', () => {
    it('returns 401 hint for 401 errors', () => {
      const result = parseAdapterErrors(['jira: HTTP 401 Unauthorized'])
      expect(result[0].hint).toBe('Your API token was rejected — check it in Settings.')
    })

    it('returns 403 hint for 403 errors', () => {
      const result = parseAdapterErrors(['github: 403 Forbidden'])
      expect(result[0].hint).toBe('Your token lacks required permissions — check scopes in Settings.')
    })

    it('returns 404 hint for 404 errors', () => {
      const result = parseAdapterErrors(['monday: 404 Not Found'])
      expect(result[0].hint).toBe('Resource not found — check your base URL or board IDs in Settings.')
    })

    it('returns 429 hint for rate limit errors', () => {
      const result = parseAdapterErrors(['jira: 429 Too Many Requests'])
      expect(result[0].hint).toBe('Rate limited by the API — wait a moment then retry.')
    })

    it('returns network hint for ENOTFOUND', () => {
      const result = parseAdapterErrors(['donedone: getaddrinfo ENOTFOUND api.example.com'])
      expect(result[0].hint).toBe('Cannot reach the server — check your network and base URL.')
    })

    it('returns network hint for ECONNREFUSED', () => {
      const result = parseAdapterErrors(['github: connect ECONNREFUSED 127.0.0.1:443'])
      expect(result[0].hint).toBe('Cannot reach the server — check your network and base URL.')
    })

    it('returns auth hint for auth-related messages', () => {
      const result = parseAdapterErrors(['jira: Authentication error occurred'])
      expect(result[0].hint).toBe('Authentication failed — check your credentials in Settings.')
    })

    it('returns generic hint for unknown errors', () => {
      const result = parseAdapterErrors(['jira: something unexpected happened'])
      expect(result[0].hint).toBe('Check your credentials and settings, then retry.')
    })
  })

  it('handles multiple errors', () => {
    const errors = [
      'jira: HTTP 401 Unauthorized',
      'github: ENOTFOUND api.github.com',
      'monday: unexpected error',
    ]
    const result = parseAdapterErrors(errors)
    expect(result).toHaveLength(3)
    expect(result[0].source).toBe('jira')
    expect(result[1].source).toBe('github')
    expect(result[2].source).toBe('monday')
  })

  it('handles error string with multiple colons (only first colon splits)', () => {
    const result = parseAdapterErrors(['jira: Error: connection refused'])
    expect(result[0].source).toBe('jira')
    expect(result[0].message).toBe('Error: connection refused')
  })
})
