import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import type { Agent } from '@/lib/db/agents'
import type { Project } from '@/lib/db'

const TMP = path.join(tmpdir(), `test-agents-${Date.now()}`)

const project: Project = {
  id: 'proj-1', name: 'Test', path: TMP,
  ideas_dir: null, specs_dir: null, plans_dir: null,
  created_at: '', last_used_at: null, automation_level: 'checkpoint',
  provider_id: null,
}

const agent: Agent = {
  id: 'ag-1', project_id: 'proj-1', name: 'CEO', title: null,
  provider_id: null, model: null,
  instructions_path: '.agents/ceo',
  status: 'idle', created_at: '', updated_at: '',
}

beforeEach(() => {
  mkdirSync(path.join(TMP, '.agents', 'ceo'), { recursive: true })
  writeFileSync(path.join(TMP, '.agents', 'ceo', 'instructions.md'), '# CEO\nDo great work.', 'utf8')
})

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true })
})

import { writeInstructions, deleteInstructions } from '@/lib/agents/writeInstructions'

describe('writeInstructions', () => {
  it('writes CLAUDE.md for claude provider', () => {
    writeInstructions(agent, project, 'claude')
    const content = readFileSync(path.join(TMP, 'CLAUDE.md'), 'utf8')
    expect(content).toContain('# CEO')
    expect(content).toContain('Do great work.')
  })

  it('writes AGENTS.md for codex provider', () => {
    writeInstructions(agent, project, 'codex')
    const content = readFileSync(path.join(TMP, 'AGENTS.md'), 'utf8')
    expect(content).toContain('Do great work.')
  })

  it('writes GEMINI.md for gemini provider', () => {
    writeInstructions(agent, project, 'gemini')
    const content = readFileSync(path.join(TMP, 'GEMINI.md'), 'utf8')
    expect(content).toContain('Do great work.')
  })

  it('writes no file for ollama provider', () => {
    writeInstructions(agent, project, 'ollama')
    expect(existsSync(path.join(TMP, 'CLAUDE.md'))).toBe(false)
    expect(existsSync(path.join(TMP, 'AGENTS.md'))).toBe(false)
    expect(existsSync(path.join(TMP, 'GEMINI.md'))).toBe(false)
  })
})

describe('deleteInstructions', () => {
  it('deletes the correct file for claude', () => {
    writeInstructions(agent, project, 'claude')
    expect(existsSync(path.join(TMP, 'CLAUDE.md'))).toBe(true)
    deleteInstructions(project, 'claude')
    expect(existsSync(path.join(TMP, 'CLAUDE.md'))).toBe(false)
  })

  it('does not throw if file does not exist', () => {
    expect(() => deleteInstructions(project, 'claude')).not.toThrow()
  })
})
