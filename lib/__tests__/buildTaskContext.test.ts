import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildTaskContext } from '../prompts'

// Mock the fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}))

import { readFileSync } from 'fs'

describe('buildTaskContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('file:// prefixed paths', () => {
    it('reads file content when idea_file starts with file://', () => {
      const mockedReadFileSync = readFileSync as ReturnType<typeof vi.fn>
      mockedReadFileSync.mockReturnValue('# My Idea\nThis is an idea')

      const result = buildTaskContext({
        idea_file: 'file:///path/to/idea.md',
        spec_file: null,
        plan_file: null,
        notes: null,
      })

      expect(mockedReadFileSync).toHaveBeenCalledWith('/path/to/idea.md', 'utf8')
      expect(result).toContain('## Idea')
      expect(result).toContain('# My Idea')
      expect(result).toContain('This is an idea')
    })

    it('reads file content when spec_file starts with file://', () => {
      const mockedReadFileSync = readFileSync as ReturnType<typeof vi.fn>
      mockedReadFileSync.mockReturnValue('# Spec\nDetailed specification')

      const result = buildTaskContext({
        idea_file: null,
        spec_file: 'file:///path/to/spec.md',
        plan_file: null,
        notes: null,
      })

      expect(mockedReadFileSync).toHaveBeenCalledWith('/path/to/spec.md', 'utf8')
      expect(result).toContain('## Spec')
      expect(result).toContain('# Spec')
      expect(result).toContain('Detailed specification')
    })

    it('reads file content when plan_file starts with file://', () => {
      const mockedReadFileSync = readFileSync as ReturnType<typeof vi.fn>
      mockedReadFileSync.mockReturnValue('# Plan\nImplementation steps')

      const result = buildTaskContext({
        idea_file: null,
        spec_file: null,
        plan_file: 'file:///path/to/plan.md',
        notes: null,
      })

      expect(mockedReadFileSync).toHaveBeenCalledWith('/path/to/plan.md', 'utf8')
      expect(result).toContain('## Plan')
      expect(result).toContain('# Plan')
      expect(result).toContain('Implementation steps')
    })
  })

  describe('inline text content', () => {
    it('treats non-prefixed idea_file as inline text', () => {
      const mockedReadFileSync = readFileSync as ReturnType<typeof vi.fn>

      const result = buildTaskContext({
        idea_file: 'This is inline idea text',
        spec_file: null,
        plan_file: null,
        notes: null,
      })

      expect(mockedReadFileSync).not.toHaveBeenCalled()
      expect(result).toContain('## Idea')
      expect(result).toContain('This is inline idea text')
    })

    it('treats non-prefixed spec_file as inline text', () => {
      const mockedReadFileSync = readFileSync as ReturnType<typeof vi.fn>

      const result = buildTaskContext({
        idea_file: null,
        spec_file: 'Inline specification content',
        plan_file: null,
        notes: null,
      })

      expect(mockedReadFileSync).not.toHaveBeenCalled()
      expect(result).toContain('## Spec')
      expect(result).toContain('Inline specification content')
    })

    it('treats non-prefixed plan_file as inline text', () => {
      const mockedReadFileSync = readFileSync as ReturnType<typeof vi.fn>

      const result = buildTaskContext({
        idea_file: null,
        spec_file: null,
        plan_file: 'Inline plan steps',
        notes: null,
      })

      expect(mockedReadFileSync).not.toHaveBeenCalled()
      expect(result).toContain('## Plan')
      expect(result).toContain('Inline plan steps')
    })
  })

  describe('null and falsy values', () => {
    it('skips null idea_file', () => {
      const result = buildTaskContext({
        idea_file: null,
        spec_file: null,
        plan_file: null,
        notes: null,
      })

      expect(result).not.toContain('## Idea')
    })

    it('skips null spec_file', () => {
      const result = buildTaskContext({
        idea_file: 'idea text',
        spec_file: null,
        plan_file: null,
        notes: null,
      })

      expect(result).not.toContain('## Spec')
    })

    it('skips null plan_file', () => {
      const result = buildTaskContext({
        idea_file: null,
        spec_file: null,
        plan_file: null,
        notes: null,
      })

      expect(result).not.toContain('## Plan')
    })

    it('returns empty string when all fields are null', () => {
      const result = buildTaskContext({
        idea_file: null,
        spec_file: null,
        plan_file: null,
        notes: null,
      })

      expect(result).toBe('')
    })
  })

  describe('file read failures', () => {
    it('returns null when file:// path does not exist', () => {
      const mockedReadFileSync = readFileSync as ReturnType<typeof vi.fn>
      mockedReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory')
      })

      const result = buildTaskContext({
        idea_file: 'file:///nonexistent.md',
        spec_file: null,
        plan_file: null,
        notes: null,
      })

      expect(result).toBe('')
    })

    it('gracefully handles read errors for spec_file', () => {
      const mockedReadFileSync = readFileSync as ReturnType<typeof vi.fn>
      mockedReadFileSync.mockImplementation(() => {
        throw new Error('Permission denied')
      })

      const result = buildTaskContext({
        idea_file: null,
        spec_file: 'file:///spec.md',
        plan_file: null,
        notes: null,
      })

      expect(result).toBe('')
    })

    it('gracefully handles read errors for plan_file', () => {
      const mockedReadFileSync = readFileSync as ReturnType<typeof vi.fn>
      mockedReadFileSync.mockImplementation(() => {
        throw new Error('Permission denied')
      })

      const result = buildTaskContext({
        idea_file: null,
        spec_file: null,
        plan_file: 'file:///plan.md',
        notes: null,
      })

      expect(result).toBe('')
    })
  })

  describe('notes field', () => {
    it('always treats notes as inline text (no file:// handling)', () => {
      const mockedReadFileSync = readFileSync as ReturnType<typeof vi.fn>

      const result = buildTaskContext({
        idea_file: null,
        spec_file: null,
        plan_file: null,
        notes: 'file://this-should-not-be-treated-as-a-path.md',
      })

      expect(mockedReadFileSync).not.toHaveBeenCalled()
      expect(result).toContain('## Correction Notes')
      expect(result).toContain('file://this-should-not-be-treated-as-a-path.md')
    })

    it('includes notes when present', () => {
      const result = buildTaskContext({
        idea_file: null,
        spec_file: null,
        plan_file: null,
        notes: 'Please fix the implementation',
      })

      expect(result).toContain('## Correction Notes')
      expect(result).toContain('Please fix the implementation')
    })

    it('skips notes when null', () => {
      const result = buildTaskContext({
        idea_file: 'idea text',
        spec_file: null,
        plan_file: null,
        notes: null,
      })

      expect(result).not.toContain('## Correction Notes')
    })
  })

  describe('combined content', () => {
    it('combines all non-null fields with proper formatting', () => {
      const mockedReadFileSync = readFileSync as ReturnType<typeof vi.fn>
      mockedReadFileSync.mockImplementation((path: string) => {
        if (path === '/idea.md') return 'Idea content'
        if (path === '/spec.md') return 'Spec content'
        if (path === '/plan.md') return 'Plan content'
        throw new Error('Unknown file')
      })

      const result = buildTaskContext({
        idea_file: 'file:///idea.md',
        spec_file: 'file:///spec.md',
        plan_file: 'file:///plan.md',
        notes: 'Correction notes',
      })

      expect(result).toContain('## Idea')
      expect(result).toContain('Idea content')
      expect(result).toContain('## Spec')
      expect(result).toContain('Spec content')
      expect(result).toContain('## Plan')
      expect(result).toContain('Plan content')
      expect(result).toContain('## Correction Notes')
      expect(result).toContain('Correction notes')
    })

    it('joins sections with double newlines', () => {
      const mockedReadFileSync = readFileSync as ReturnType<typeof vi.fn>
      mockedReadFileSync.mockReturnValue('content')

      const result = buildTaskContext({
        idea_file: 'file:///idea.md',
        spec_file: 'file:///spec.md',
        plan_file: null,
        notes: null,
      })

      expect(result).toContain('\n\n')
    })

    it('handles mix of file:// and inline text', () => {
      const mockedReadFileSync = readFileSync as ReturnType<typeof vi.fn>
      mockedReadFileSync.mockReturnValue('file content')

      const result = buildTaskContext({
        idea_file: 'file:///idea.md',
        spec_file: 'inline spec text',
        plan_file: null,
        notes: 'correction',
      })

      expect(mockedReadFileSync).toHaveBeenCalledOnce()
      expect(result).toContain('## Idea')
      expect(result).toContain('file content')
      expect(result).toContain('## Spec')
      expect(result).toContain('inline spec text')
      expect(result).toContain('## Correction Notes')
      expect(result).toContain('correction')
    })
  })
})
