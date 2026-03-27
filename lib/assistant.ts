// lib/assistant.ts
import type { DashboardResponse } from './dashboard'
import type { AppEvent } from './events'
import type { MemoryFile } from './memory'

export type Suggestion = {
  id: string
  priority: 'high' | 'medium' | 'low'
  icon: string
  title: string
  description: string
  action?: {
    label: string
    type: 'navigate' | 'launch_session' | 'run_audit' | 'create_file'
    payload: Record<string, string>
  }
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

export function generateSuggestions(data: DashboardResponse): Suggestion[] {
  const suggestions: Suggestion[] = []
  let id = 0

  // Plans with audit blockers
  for (const item of data.upNext) {
    if (item.stage === 'develop' && item.auditStatus === 'blockers') {
      suggestions.push({
        id: `s-${id++}`,
        priority: 'high',
        icon: '🔴',
        title: `Fix blockers in ${item.featureName}`,
        description: `Plan has audit blockers — fix before developing.`,
        action: { label: 'View Plan →', type: 'navigate', payload: { projectId: item.projectId, route: '/plans' } },
      })
    }
  }

  // Features ready to develop (audit clean)
  for (const item of data.upNext) {
    if (item.stage === 'develop' && item.auditStatus === 'clean' && !item.stale) {
      suggestions.push({
        id: `s-${id++}`,
        priority: 'high',
        icon: '🟢',
        title: `${item.featureName} ready to build`,
        description: `Audit clean — start developing.`,
        action: { label: 'Start Developing →', type: 'launch_session', payload: { projectId: item.projectId, filePath: item.filePath, featureName: item.featureName } },
      })
    }
  }

  // Unaudited plans
  const unaudited = data.upNext.filter(i => i.stage === 'develop' && i.auditStatus === null)
  if (unaudited.length > 0) {
    suggestions.push({
      id: `s-${id++}`,
      priority: 'medium',
      icon: '🔍',
      title: `${unaudited.length} plan${unaudited.length > 1 ? 's' : ''} unaudited`,
      description: `Run audits before developing.`,
      action: { label: 'Go to Plans →', type: 'navigate', payload: { route: '/plans' } },
    })
  }

  // Specs without plans (stale > 3 days handled by stale flag)
  const needsPlanning = data.upNext.filter(i => i.stage === 'plan')
  for (const item of needsPlanning.slice(0, 2)) {
    suggestions.push({
      id: `s-${id++}`,
      priority: 'medium',
      icon: '🗺',
      title: `Create plan for ${item.featureName}`,
      description: `Spec exists but no plan yet.`,
      action: { label: 'Plan →', type: 'launch_session', payload: { projectId: item.projectId, filePath: item.filePath, featureName: item.featureName, phase: 'plan' } },
    })
  }

  // Ideas without specs
  const needsSpec = data.upNext.filter(i => i.stage === 'spec')
  for (const item of needsSpec.slice(0, 2)) {
    suggestions.push({
      id: `s-${id++}`,
      priority: 'low',
      icon: '💡',
      title: `Flesh out ${item.featureName}`,
      description: `Idea waiting to become a spec.`,
      action: { label: 'Spec →', type: 'launch_session', payload: { projectId: item.projectId, filePath: item.filePath, featureName: item.featureName, phase: 'spec' } },
    })
  }

  // All quiet
  if (data.inProgress.length === 0 && data.upNext.length === 0) {
    suggestions.push({
      id: `s-${id++}`,
      priority: 'low',
      icon: '✨',
      title: 'All caught up!',
      description: 'No actionable features. Time to brainstorm new ideas?',
    })
  }

  // Sort by priority
  suggestions.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])

  return suggestions.slice(0, 5)
}

export function buildAssistantSystemPrompt(opts: {
  dashboardData: DashboardResponse
  projectName?: string
  projectPath?: string
  memoryFiles?: MemoryFile[]
  recentEvents?: AppEvent[]
  currentPage?: string
}): string {
  const parts: string[] = []

  parts.push(`You are the Project Assistant for a development workflow dashboard called project-control.

Your role:
- Help the user decide what to work on next
- Refine rough ideas into structured specs or plans
- Suggest improvements to existing plans
- Draft markdown content when asked (ideas, specs, plans)
- Be concise and actionable — prefer bullet points over paragraphs
- When drafting content, use proper markdown with headings

Important: When the user asks you to draft an idea, spec, or plan, output it as well-structured markdown that can be saved directly to a file.`)

  // Pipeline state
  const d = opts.dashboardData
  parts.push(`\n## Current Pipeline State
- ${d.pipeline.ideas} ideas, ${d.pipeline.specs} specs, ${d.pipeline.plans} plans
- ${d.pipeline.active} active sessions
- ${d.inProgress.length} sessions in progress
- ${d.upNext.length} features in "Up Next"
- Health: ${d.health.blockers} with blockers, ${d.health.warnings} with warnings, ${d.health.clean} clean`)

  if (d.upNext.length > 0) {
    parts.push(`\n## Up Next (top 5)`)
    for (const item of d.upNext.slice(0, 5)) {
      const audit = item.auditStatus ? ` [${item.auditStatus}]` : ''
      parts.push(`- **${item.featureName}** (${item.projectName}) — stage: ${item.stage}${audit}${item.stale ? ' ⏸ stale' : ''}`)
    }
  }

  if (opts.projectName) {
    parts.push(`\n## Active Project: ${opts.projectName}`)
    if (opts.projectPath) parts.push(`Path: ${opts.projectPath}`)
  }

  if (opts.memoryFiles && opts.memoryFiles.length > 0) {
    parts.push(`\n## Project Memory (${opts.memoryFiles.length} files)`)
    for (const m of opts.memoryFiles.slice(0, 5)) {
      parts.push(`- [${m.type}] ${m.name}: ${m.description || '(no description)'}`)
    }
  }

  if (opts.recentEvents && opts.recentEvents.length > 0) {
    parts.push(`\n## Recent Events`)
    for (const e of opts.recentEvents.slice(0, 8)) {
      parts.push(`- ${e.type}: ${e.summary}`)
    }
  }

  if (opts.currentPage) {
    parts.push(`\nThe user is currently on the **${opts.currentPage}** page.`)
  }

  return parts.join('\n')
}
