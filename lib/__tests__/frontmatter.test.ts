import { describe, it, expect } from 'vitest'
import { parseFrontmatter, writeFrontmatter } from '../frontmatter'

describe('parseFrontmatter', () => {
  it('returns empty object when no frontmatter', () => {
    expect(parseFrontmatter('# Title\n\nBody')).toEqual({})
  })

  it('parses existing frontmatter keys', () => {
    const content = '---\nideate_session_id: abc-123\nideate_log_id: null\n---\n\n# Title'
    const fm = parseFrontmatter(content)
    expect(fm.ideate_session_id).toBe('abc-123')
    expect(fm.ideate_log_id).toBeNull()
  })

  it('handles values containing colons (e.g. paths with protocol)', () => {
    const content = '---\nurl: https://example.com\nlog_id: /path/to/log.md\n---\n\n# Title'
    const fm = parseFrontmatter(content)
    expect(fm.url).toBe('https://example.com')
    expect(fm.log_id).toBe('/path/to/log.md')
  })
})

describe('writeFrontmatter', () => {
  it('adds frontmatter to a file with none', () => {
    const result = writeFrontmatter('# Title\n\nBody', { ideate_session_id: 'abc' })
    expect(result).toMatch(/^---\n/)
    expect(result).toContain('ideate_session_id: abc')
    expect(result).toContain('# Title')
  })

  it('merges into existing frontmatter without losing other keys', () => {
    const content = '---\ntitle: My Idea\nideate_session_id: old\n---\n\n# Title'
    const result = writeFrontmatter(content, { ideate_session_id: 'new', ideate_log_id: '/path/log.md' })
    const fm = parseFrontmatter(result)
    expect(fm.title).toBe('My Idea')
    expect(fm.ideate_session_id).toBe('new')
    expect(fm.ideate_log_id).toBe('/path/log.md')
  })

  it('serialises null correctly', () => {
    const result = writeFrontmatter('# Title', { ideate_log_id: null })
    expect(result).toContain('ideate_log_id: null')
  })
})
