// lib/prompts.ts
import { readFileSync } from 'fs'
import type { Task } from '@/lib/db/tasks'
import { getAdapter } from './sessions/adapters'
import type { ProviderType } from './db/providers'

export type Phase = 'ideate' | 'brainstorm' | 'spec' | 'plan' | 'develop' | 'review' | 'audit'
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'

const TEMPLATES: Record<Phase, (sourceFile: string) => string> = {
  ideate: (f) =>
    `Read the idea file at ${f}. Your role is to help the user develop this idea through collaborative dialogue.\n\nIf the @consult-gemini skill is available in ~/.claude/skills/, use it to explore the idea from multiple angles before surfacing conclusions. Otherwise, ideate solo.\n\nStart by asking one clarifying question about the core problem this idea solves. Then explore: who the users are, what constraints exist, what a minimal version looks like. After sufficient back-and-forth, synthesise the conversation into a structured brainstorm document saved alongside the idea file with a -brainstorm suffix (e.g. my-idea-brainstorm.md). The document should cover: core problem, target users, key features, technical approach, open questions, and risks.`,
  brainstorm: (f) =>
    `Read the idea file at ${f}. Explore the idea through clarifying questions and deep analysis. Produce a structured brainstorm document covering: core problem, target users, key features, technical considerations, open questions, and risks. Save the result as a new .md file in the same directory with a -brainstorm suffix.`,
  spec: (f) =>
    `Read the idea/brainstorm file at ${f}. Produce a detailed technical spec covering: overview, architecture, components and their responsibilities, data models, API contracts, key user flows, edge cases, and out of scope items. Save as a .md file in the project's specs directory.`,
  plan: (f) =>
    `Read the spec at ${f}. Produce a step-by-step implementation plan broken into small, independently testable tasks. Each task should specify exact files to create or modify, the implementation approach, and how to verify it works. Save as a .md file in the project's plans directory.`,
  develop: (f) =>
    `Read the plan at ${f}. Implement it task by task. Follow any CLAUDE.md conventions in the project. Write tests before implementation (TDD). Commit after each task. Ask if anything in the plan is unclear before starting.`,
  review: (f) =>
    `Read the implementation described in ${f} and review the associated code changes. Check for: correctness, security vulnerabilities, edge cases not handled, code quality, test coverage, and adherence to project conventions. Produce a structured review report.`,
  audit: (_f) => '', // audit prompt is built dynamically in the audit route — this entry satisfies the type
}

export function getSystemPrompt(phase: Phase, sourceFile: string): string {
  return TEMPLATES[phase](sourceFile)
}

export type SessionContext = {
  phase: Phase
  sourceFile: string | null
  userContext?: string
  gitHistory?: string | null
  correctionNote?: string | null
  contextPacks?: Array<{ title: string; content: string }> | null
}

export function buildSessionContext(ctx: SessionContext): string {
  const parts: string[] = []

  if (ctx.correctionNote?.trim()) {
    parts.push(`> CORRECTION FROM PREVIOUS PHASE:\n> ${ctx.correctionNote.trim()}\n\n---\n`)
  }

  const basePrompt = ctx.sourceFile
    ? getSystemPrompt(ctx.phase, ctx.sourceFile)
    : `You are helping with a ${ctx.phase} session.`
  parts.push(basePrompt)

  if (ctx.gitHistory) {
    parts.push(`\n\n## Recent Git History\n\n${ctx.gitHistory}`)
  }

  if (ctx.contextPacks && ctx.contextPacks.length > 0) {
    parts.push('\n\n## Reference Documentation')
    for (const pack of ctx.contextPacks) {
      parts.push(`\n### ${pack.title}\n${pack.content}`)
    }
  }

  return parts.join('\n')
}

// Returns the prompt string. The route builds frontmatter separately from Claude's output
// using buildFrontmatter() so the timestamp is injected server-side, not by Claude.
export function buildAuditPrompt(opts: {
  planFilename: string
  planContent: string
  specContent: string | null
  memoryContent: string | null
}): string {
  return `You are auditing an implementation plan. Respond with ONLY the report body — no frontmatter, no preamble. Start your response directly with the "# Audit:" heading.

# Audit: ${opts.planFilename}

## 🔴 Blockers
Issues that will cause implementation failure (missing file paths, contradictory instructions, undefined dependencies, impossible steps). List each as a bullet: **[category]** Description. *Suggested fix.*
If none: write "None found."

## 🟡 Warnings
Issues that will cause friction, bugs, or incomplete implementation (vague steps, missing error handling, no rollback strategy, overly large tasks). List each as a bullet: **[category]** Description. *Suggested fix.*
If none: write "None found."

## 🟢 Ready
What looks solid and well-specified. 2-3 sentences.

## Memory Conflicts
Any contradictions between the plan and project memory. Write "None found." if clean.

---

## Project Memory
${opts.memoryContent ?? 'No memory files found for this project.'}

## Spec
${opts.specContent ?? 'No matching spec file found.'}

## Plan to audit
${opts.planContent}
`
}

// Counts bullet points in blocker/warning sections to build the frontmatter block
export function buildFrontmatter(body: string, auditedAt: string, planFilename: string): string {
  const blockersSection = body.match(/## 🔴 Blockers\n([\s\S]*?)(?=\n##|$)/)?.[1] ?? ''
  const warningsSection = body.match(/## 🟡 Warnings\n([\s\S]*?)(?=\n##|$)/)?.[1] ?? ''
  const blockers = blockersSection.includes('None found') ? 0 : (blockersSection.match(/^- /gm)?.length ?? 0)
  const warnings = warningsSection.includes('None found') ? 0 : (warningsSection.match(/^- /gm)?.length ?? 0)
  return `---\nblockers: ${blockers}\nwarnings: ${warnings}\naudited_at: ${auditedAt}\nplan_file: ${planFilename}\n---\n\n`
}

export function buildArgs(opts: {
  systemPrompt: string
  userContext: string
  permissionMode: PermissionMode
  sessionId: string
  providerType: ProviderType
}): string[] {
  const adapter = getAdapter(opts.providerType)
  return adapter.buildArgs({
    systemPrompt: opts.systemPrompt,
    userContext: opts.userContext,
    permissionMode: opts.permissionMode,
    sessionId: opts.sessionId,
  })
}

function readFieldContent(value: string | null): string | null {
  if (!value) return null
  if (value.startsWith('file://')) {
    try {
      return readFileSync(value.slice(7), 'utf8')
    } catch {
      return null
    }
  }
  return value // inline text
}

export function buildTaskContext(task: Pick<Task, 'idea_file' | 'spec_file' | 'plan_file' | 'notes'>): string {
  const sections: string[] = []

  const idea = readFieldContent(task.idea_file)
  if (idea) sections.push(`## Idea\n${idea}`)

  const spec = readFieldContent(task.spec_file)
  if (spec) sections.push(`## Spec\n${spec}`)

  const plan = readFieldContent(task.plan_file)
  if (plan) sections.push(`## Plan\n${plan}`)

  if (task.notes) {
    sections.push(`## Correction Notes\n${task.notes}`)
  }

  return sections.join('\n\n')
}

export function generateOutputPath(dir: string, taskTitle: string): string {
  const date = new Date().toISOString().split('T')[0]
  const slug = taskTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${dir}/${date}-${slug}.md`
}
