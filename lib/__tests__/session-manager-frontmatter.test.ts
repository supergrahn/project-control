import { describe, it, expect } from 'vitest'
import path from 'path'

describe('session log path generation', () => {
  it('generates a log path in a logs/ subdir alongside the source file', () => {
    const sourceFile = '/data/ideas/my-idea.md'
    const phase = 'ideate'
    const logsDir = path.join(path.dirname(sourceFile), 'logs')
    const base = path.basename(sourceFile, '.md')
    const logPath = path.join(logsDir, `${base}-${phase}-log.md`)
    expect(logPath).toBe('/data/ideas/logs/my-idea-ideate-log.md')
  })
})
