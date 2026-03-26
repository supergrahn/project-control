export type Phase = 'brainstorm' | 'spec' | 'plan' | 'develop' | 'review'
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'

const TEMPLATES: Record<Phase, (sourceFile: string) => string> = {
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
}

export function getSystemPrompt(phase: Phase, sourceFile: string): string {
  return TEMPLATES[phase](sourceFile)
}

export function buildArgs(opts: {
  systemPrompt: string
  userContext: string
  permissionMode: PermissionMode
  sessionId: string
}): string[] {
  const args: string[] = [
    '--system-prompt', opts.systemPrompt,
    '--session-id', opts.sessionId,
    '--permission-mode', opts.permissionMode,
  ]
  if (opts.userContext.trim()) {
    args.push(opts.userContext.trim())
  }
  return args
}
