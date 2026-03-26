// tests/lib/memory.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { encodeProjectPath, resolveMemoryDir, parseMemoryFile, listMemoryFiles } from '@/lib/memory'

describe('encodeProjectPath', () => {
  it('replaces all slashes with dashes', () => {
    expect(encodeProjectPath('/home/user/git/foo')).toBe('-home-user-git-foo')
  })
  it('handles paths with hyphens in folder names', () => {
    expect(encodeProjectPath('/home/user/my-project')).toBe('-home-user-my-project')
  })
})

describe('parseMemoryFile', () => {
  const modifiedAt = '2026-03-26T00:00:00.000Z'

  it('extracts frontmatter fields', () => {
    const content = `---\nname: Test Memory\ndescription: A test\ntype: feedback\n---\n\nBody text`
    const result = parseMemoryFile('feedback_test.md', '/virtual/feedback_test.md', content, modifiedAt)
    expect(result.name).toBe('Test Memory')
    expect(result.description).toBe('A test')
    expect(result.type).toBe('feedback')
    expect(result.content).toBe(content)
    expect(result.modifiedAt).toBe(modifiedAt)
  })

  it('falls back to filename when frontmatter is missing', () => {
    const content = `# Just a heading\n\nSome text`
    const result = parseMemoryFile('project_goals.md', '/virtual/project_goals.md', content, modifiedAt)
    expect(result.name).toBe('project_goals')
    expect(result.type).toBe('project')
    expect(result.description).toBe('')
  })
})

describe('resolveMemoryDir', () => {
  let tmpDir: string
  let projectPath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-test-'))
    projectPath = '/home/testuser/git/myproject'
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns expected path when directory exists', () => {
    const encoded = encodeProjectPath(projectPath)
    const expectedDir = path.join(tmpDir, encoded, 'memory')
    fs.mkdirSync(expectedDir, { recursive: true })
    const result = resolveMemoryDir(projectPath, tmpDir)
    expect(result).toBe(expectedDir)
  })

  it('returns null when no matching directory', () => {
    const result = resolveMemoryDir(projectPath, tmpDir)
    expect(result).toBeNull()
  })

  it('returns fuzzy-matched path when name differs by 1-3 chars', () => {
    const encoded = encodeProjectPath(projectPath)
    // Create a dir with one char different (simulating minor encoding difference)
    const fuzzyName = encoded.slice(0, -1) + 'x' // change last char
    const fuzzyMemDir = path.join(tmpDir, fuzzyName, 'memory')
    fs.mkdirSync(fuzzyMemDir, { recursive: true })
    const result = resolveMemoryDir(projectPath, tmpDir)
    expect(result).toBe(fuzzyMemDir)
  })
})
