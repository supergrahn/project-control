import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, unlinkSync } from 'fs'
import { buildTaskContext } from '../prompts'
import { tmpdir } from 'os'
import { join } from 'path'

describe('buildTaskContext', () => {
  let tempDir: string
  let fileCount = 0

  beforeEach(() => {
    tempDir = tmpdir()
    fileCount = 0
  })

  afterEach(() => {
    // Clean up temp files
    for (let i = 0; i < fileCount; i++) {
      try {
        unlinkSync(join(tempDir, `test-file-${i}.md`))
      } catch {}
    }
  })

  function createTempFile(content: string): string {
    const filePath = join(tempDir, `test-file-${fileCount}.md`)
    writeFileSync(filePath, content, 'utf8')
    fileCount++
    return filePath
  }

  describe('file:// prefixed paths', () => {
    it('reads file content when idea_file starts with file://', () => {
      const filePath = createTempFile('# My Idea\nThis is an idea')

      const result = buildTaskContext({
        idea_file: `file://${filePath}`,
        spec_file: null,
        plan_file: null,
        notes: null,
      })

      expect(result).toContain('## Idea')
      expect(result).toContain('# My Idea')
      expect(result).toContain('This is an idea')
    })

    it('reads file content when spec_file starts with file://', () => {
      const filePath = createTempFile('# Spec\nDetailed specification')

      const result = buildTaskContext({
        idea_file: null,
        spec_file: `file://${filePath}`,
        plan_file: null,
        notes: null,
      })

      expect(result).toContain('## Spec')
      expect(result).toContain('# Spec')
      expect(result).toContain('Detailed specification')
    })

    it('reads file content when plan_file starts with file://', () => {
      const filePath = createTempFile('# Plan\nImplementation steps')

      const result = buildTaskContext({
        idea_file: null,
        spec_file: null,
        plan_file: `file://${filePath}`,
        notes: null,
      })

      expect(result).toContain('## Plan')
      expect(result).toContain('# Plan')
      expect(result).toContain('Implementation steps')
    })
  })

  describe('inline text content', () => {
    it('treats non-prefixed idea_file as inline text', () => {
      const result = buildTaskContext({
        idea_file: 'This is inline idea text',
        spec_file: null,
        plan_file: null,
        notes: null,
      })

      expect(result).toContain('## Idea')
      expect(result).toContain('This is inline idea text')
    })

    it('treats non-prefixed spec_file as inline text', () => {
      const result = buildTaskContext({
        idea_file: null,
        spec_file: 'Inline specification content',
        plan_file: null,
        notes: null,
      })

      expect(result).toContain('## Spec')
      expect(result).toContain('Inline specification content')
    })

    it('treats non-prefixed plan_file as inline text', () => {
      const result = buildTaskContext({
        idea_file: null,
        spec_file: null,
        plan_file: 'Inline plan steps',
        notes: null,
      })

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
    it('gracefully handles missing file:// path (returns empty content)', () => {
      const result = buildTaskContext({
        idea_file: 'file:///nonexistent-file-that-does-not-exist.md',
        spec_file: null,
        plan_file: null,
        notes: null,
      })

      expect(result).toBe('')
    })

    it('gracefully handles read errors for spec_file', () => {
      const result = buildTaskContext({
        idea_file: null,
        spec_file: 'file:///nonexistent-spec.md',
        plan_file: null,
        notes: null,
      })

      expect(result).toBe('')
    })

    it('gracefully handles read errors for plan_file', () => {
      const result = buildTaskContext({
        idea_file: null,
        spec_file: null,
        plan_file: 'file:///nonexistent-plan.md',
        notes: null,
      })

      expect(result).toBe('')
    })
  })

  describe('notes field', () => {
    it('always treats notes as inline text (no file:// handling)', () => {
      const result = buildTaskContext({
        idea_file: null,
        spec_file: null,
        plan_file: null,
        notes: 'file://this-should-not-be-treated-as-a-path.md',
      })

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
      const ideaPath = createTempFile('Idea content')
      const specPath = createTempFile('Spec content')
      const planPath = createTempFile('Plan content')

      const result = buildTaskContext({
        idea_file: `file://${ideaPath}`,
        spec_file: `file://${specPath}`,
        plan_file: `file://${planPath}`,
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
      const ideaPath = createTempFile('content')
      const specPath = createTempFile('content')

      const result = buildTaskContext({
        idea_file: `file://${ideaPath}`,
        spec_file: `file://${specPath}`,
        plan_file: null,
        notes: null,
      })

      expect(result).toContain('\n\n')
    })

    it('handles mix of file:// and inline text', () => {
      const ideaPath = createTempFile('file content')

      const result = buildTaskContext({
        idea_file: `file://${ideaPath}`,
        spec_file: 'inline spec text',
        plan_file: null,
        notes: 'correction',
      })

      expect(result).toContain('## Idea')
      expect(result).toContain('file content')
      expect(result).toContain('## Spec')
      expect(result).toContain('inline spec text')
      expect(result).toContain('## Correction Notes')
      expect(result).toContain('correction')
    })
  })
})
