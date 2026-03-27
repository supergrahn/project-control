import { describe, it, expect } from 'vitest'
import { getGitHistory } from '@/lib/git'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFileSync } from 'child_process'

describe('getGitHistory', () => {
  let tmpDir: string

  it('returns null for non-git directory', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-test-'))
    expect(getGitHistory(tmpDir)).toBeNull()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns recent commits for a git repo', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-test-'))
    execFileSync('git', ['init'], { cwd: tmpDir })
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tmpDir })
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmpDir })
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'hello')
    execFileSync('git', ['add', '.'], { cwd: tmpDir })
    execFileSync('git', ['commit', '-m', 'initial commit'], { cwd: tmpDir })
    const result = getGitHistory(tmpDir)
    expect(result).toContain('initial commit')
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns null for empty repo (no commits)', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-test-'))
    execFileSync('git', ['init'], { cwd: tmpDir })
    expect(getGitHistory(tmpDir)).toBeNull()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})
