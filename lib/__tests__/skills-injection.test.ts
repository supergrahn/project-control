import { describe, it, expect, vi } from 'vitest'
import path from 'path'

// Test the concatenation logic in isolation — identical to the implementation in session-manager.ts
function buildSkillsBlock(
  skills: Array<{ name: string; file_path: string }>,
  projectPath: string,
  readFileSync: (p: string, enc: string) => string
): string {
  if (skills.length === 0) return ''
  return skills
    .map(s => {
      const content = readFileSync(path.join(projectPath, s.file_path), 'utf8')
      return `## Skill: ${s.name}\n\n${content}`
    })
    .join('\n\n---\n\n')
}

describe('buildSkillsBlock', () => {
  it('returns empty string when no skills', () => {
    const readMock = vi.fn()
    expect(buildSkillsBlock([], '/tmp/proj', readMock)).toBe('')
    expect(readMock).not.toHaveBeenCalled()
  })

  it('produces correct format for one skill', () => {
    const readMock = vi.fn().mockReturnValue('# My Skill\n\nDo the thing.')
    const result = buildSkillsBlock(
      [{ name: 'My Skill', file_path: '.skills/my-skill.md' }],
      '/tmp/proj',
      readMock
    )
    expect(result).toBe('## Skill: My Skill\n\n# My Skill\n\nDo the thing.')
    expect(readMock).toHaveBeenCalledWith('/tmp/proj/.skills/my-skill.md', 'utf8')
  })

  it('joins multiple skills with separator', () => {
    const readMock = vi.fn()
      .mockReturnValueOnce('Content A')
      .mockReturnValueOnce('Content B')
    const result = buildSkillsBlock(
      [{ name: 'Skill A', file_path: '.skills/a.md' }, { name: 'Skill B', file_path: '.skills/b.md' }],
      '/tmp/proj',
      readMock
    )
    expect(result).toContain('## Skill: Skill A\n\nContent A')
    expect(result).toContain('\n\n---\n\n')
    expect(result).toContain('## Skill: Skill B\n\nContent B')
  })
})
