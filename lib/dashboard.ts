// lib/dashboard.ts
import fs from 'fs'
import path from 'path'
import type { Project, Session } from '@/lib/db'

// --- Types ---

export type Stage = 'develop' | 'plan' | 'spec'
export type AuditLabel = 'clean' | 'warnings' | 'blockers'

export type FeatureEntry = {
  key: string
  originalBasenames: { idea?: string; spec?: string; plan?: string }
  idea: string | null
  spec: string | null
  plan: string | null
  audit: { blockers: number; warnings: number } | null
  latestModified: Date
  frontmatterStatus: string | null
}

export type DashboardResponse = {
  inProgress: Array<{
    projectId: string
    projectName: string
    sessionId: string
    phase: string
    sourceFile: string
    featureName: string
    createdAt: string
  }>
  upNext: Array<{
    projectId: string
    projectName: string
    featureName: string
    filePath: string
    stage: Stage
    auditStatus: AuditLabel | null
    stale: boolean
    status: string | null
  }>
  pipeline: { ideas: number; specs: number; plans: number; active: number }
  health: {
    blockers: number
    warnings: number
    clean: number
    unaudited: number
    worst: Array<{ projectName: string; planName: string; blockers: number; warnings: number }>
  }
  recentlyTouched: Array<{
    projectId: string
    projectName: string
    featureName: string
    dir: 'ideas' | 'specs' | 'plans'
    modifiedAt: string
  }>
}

// --- Pure functions ---

const DATE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}-/

export function stripDatePrefix(filename: string): string {
  return filename.replace(DATE_PREFIX_RE, '')
}

export function inferStage(entry: FeatureEntry, hasActiveSession: boolean): Stage | 'inProgress' | null {
  if (entry.plan) {
    return hasActiveSession ? 'inProgress' : 'develop'
  }
  if (entry.spec) return 'plan'
  if (entry.idea) return 'spec'
  return null
}

export function applyOverrides(entry: FeatureEntry, stage: Stage | null): Stage | null {
  const s = entry.frontmatterStatus
  if (s === 'done' || s === 'skip') return null
  if (s === 'ready' && stage === null) {
    if (entry.plan) return 'develop'
    if (entry.spec) return 'plan'
    if (entry.idea) return 'spec'
    return null
  }
  return stage
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export function detectStale(entry: FeatureEntry, now: Date): boolean {
  if (entry.frontmatterStatus) return false
  return now.getTime() - entry.latestModified.getTime() > SEVEN_DAYS_MS
}

export function auditLabel(audit: { blockers: number; warnings: number } | null): AuditLabel | null {
  if (!audit) return null
  if (audit.blockers > 0) return 'blockers'
  if (audit.warnings > 0) return 'warnings'
  return 'clean'
}
