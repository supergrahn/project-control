import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scanGitDir } from '@/lib/project-scanner'
import fs from 'fs'

vi.mock('fs')

describe('scanGitDir', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns folders found in ~/git', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'my-app', isDirectory: () => true } as any,
      { name: 'other-project', isDirectory: () => true } as any,
      { name: 'README.md', isDirectory: () => false } as any,
    ])
    const results = scanGitDir('/home/tom/git')
    expect(results).toHaveLength(2)
    expect(results[0].name).toBe('my-app')
    expect(results[0].path).toBe('/home/tom/git/my-app')
  })

  it('returns empty array if ~/git does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    expect(scanGitDir('/home/tom/git')).toEqual([])
  })
})
