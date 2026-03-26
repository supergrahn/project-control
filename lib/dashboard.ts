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

// --- Filesystem functions ---

function readStatus(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const fm = content.match(/^---\n([\s\S]*?)\n---/)
    if (!fm) return null
    const statusMatch = fm[1].match(/^status:\s*(.+)$/m)
    return statusMatch?.[1]?.trim() ?? null
  } catch {
    return null
  }
}

function scanDir(dirPath: string): Array<{ filename: string; basename: string; strippedKey: string; filePath: string; mtime: Date }> {
  if (!fs.existsSync(dirPath)) return []
  try {
    return fs.readdirSync(dirPath)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const filePath = path.join(dirPath, f)
        const basename = f.replace(/\.md$/, '')
        const strippedKey = stripDatePrefix(basename)
        const mtime = fs.statSync(filePath).mtime
        return { filename: f, basename, strippedKey, filePath, mtime }
      })
  } catch {
    return []
  }
}

function parseAuditFrontmatter(content: string): { blockers: number; warnings: number } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null
  const fm = match[1]
  const blockers = parseInt(fm.match(/^blockers:\s*(.+)$/m)?.[1] ?? '0', 10) || 0
  const warnings = parseInt(fm.match(/^warnings:\s*(.+)$/m)?.[1] ?? '0', 10) || 0
  return { blockers, warnings }
}

function loadAuditMap(plansDir: string): Map<string, { blockers: number; warnings: number }> {
  const auditsDir = path.join(plansDir, 'audits')
  const map = new Map<string, { blockers: number; warnings: number }>()
  if (!fs.existsSync(auditsDir)) return map

  try {
    const files = fs.readdirSync(auditsDir)
      .filter(f => f.endsWith('.md') && f.includes('-audit-'))
      .sort() // lexicographic = date order, last wins (most recent)

    for (const filename of files) {
      const m = filename.match(/^(.+)-audit-\d{4}-\d{2}-\d{2}\.md$/)
      if (!m) continue
      const planBasename = m[1]
      try {
        const content = fs.readFileSync(path.join(auditsDir, filename), 'utf8')
        const parsed = parseAuditFrontmatter(content)
        if (parsed) map.set(planBasename, parsed)
      } catch { /* skip unreadable */ }
    }
  } catch { /* skip unreadable dir */ }

  return map
}

export function buildFeatureMap(
  projectPath: string,
  dirs: { ideas_dir?: string | null; specs_dir?: string | null; plans_dir?: string | null }
): Map<string, FeatureEntry> {
  const map = new Map<string, FeatureEntry>()

  function getOrCreate(key: string): FeatureEntry {
    if (!map.has(key)) {
      map.set(key, {
        key,
        originalBasenames: {},
        idea: null,
        spec: null,
        plan: null,
        audit: null,
        latestModified: new Date(0),
        frontmatterStatus: null,
      })
    }
    return map.get(key)!
  }

  const dirConfigs: Array<{ dir: string | null | undefined; type: 'idea' | 'spec' | 'plan' }> = [
    { dir: dirs.ideas_dir, type: 'idea' },
    { dir: dirs.specs_dir, type: 'spec' },
    { dir: dirs.plans_dir, type: 'plan' },
  ]

  for (const { dir, type } of dirConfigs) {
    if (!dir) continue
    const absDir = path.resolve(projectPath, dir)
    for (const file of scanDir(absDir)) {
      const entry = getOrCreate(file.strippedKey)
      entry[type] = file.filePath
      entry.originalBasenames[type] = file.basename
      if (file.mtime > entry.latestModified) entry.latestModified = file.mtime

      if (type === 'plan' || (type === 'spec' && !entry.plan) || (type === 'idea' && !entry.spec && !entry.plan)) {
        const status = readStatus(file.filePath)
        if (status) entry.frontmatterStatus = status
      }
    }
  }

  if (dirs.plans_dir) {
    const plansAbsDir = path.resolve(projectPath, dirs.plans_dir)
    const auditMap = loadAuditMap(plansAbsDir)
    for (const entry of map.values()) {
      if (entry.originalBasenames.plan) {
        const auditData = auditMap.get(entry.originalBasenames.plan)
        if (auditData) entry.audit = auditData
      }
    }
  }

  return map
}

// --- Orchestrator ---

const STAGE_ORDER: Stage[] = ['develop', 'plan', 'spec']

// Note: spec shows single-parameter signature, but we accept activeSessions separately
// for testability (avoids DB dependency inside the function).
export function buildDashboardData(projects: Project[], activeSessions: Session[]): DashboardResponse {
  const now = new Date()
  const sessionSourceFiles = new Set(activeSessions.map(s => s.source_file).filter(Boolean))

  const inProgress: DashboardResponse['inProgress'] = []
  const upNext: DashboardResponse['upNext'] = []
  const pipeline = { ideas: 0, specs: 0, plans: 0, active: activeSessions.length }
  const health = { blockers: 0, warnings: 0, clean: 0, unaudited: 0, worst: [] as DashboardResponse['health']['worst'] }
  const recentlyTouched: DashboardResponse['recentlyTouched'] = []

  for (const session of activeSessions) {
    const project = projects.find(p => p.id === session.project_id)
    if (!project) continue
    const featureName = session.source_file
      ? stripDatePrefix(path.basename(session.source_file, '.md'))
      : session.label
    inProgress.push({
      projectId: project.id,
      projectName: project.name,
      sessionId: session.id,
      phase: session.phase,
      sourceFile: session.source_file ?? '',
      featureName,
      createdAt: session.created_at,
    })
  }

  for (const project of projects) {
    if (!project.ideas_dir && !project.specs_dir && !project.plans_dir) continue

    const featureMap = buildFeatureMap(project.path, {
      ideas_dir: project.ideas_dir,
      specs_dir: project.specs_dir,
      plans_dir: project.plans_dir,
    })

    for (const entry of featureMap.values()) {
      if (entry.idea) pipeline.ideas++
      if (entry.spec) pipeline.specs++
      if (entry.plan) pipeline.plans++

      if (entry.plan) {
        if (!entry.audit) {
          health.unaudited++
        } else if (entry.audit.blockers > 0) {
          health.blockers++
          health.worst.push({ projectName: project.name, planName: entry.key, blockers: entry.audit.blockers, warnings: entry.audit.warnings })
        } else if (entry.audit.warnings > 0) {
          health.warnings++
        } else {
          health.clean++
        }
      }

      // Recently touched — all features contribute regardless of stage/status
      const bestDir: 'plans' | 'specs' | 'ideas' = entry.plan ? 'plans' : entry.spec ? 'specs' : 'ideas'
      recentlyTouched.push({
        projectId: project.id,
        projectName: project.name,
        featureName: entry.key,
        dir: bestDir,
        modifiedAt: entry.latestModified.toISOString(),
      })

      const hasActiveSession = entry.plan ? sessionSourceFiles.has(entry.plan) : false
      const rawStage = inferStage(entry, hasActiveSession)

      if (rawStage === 'inProgress') continue

      const stage = applyOverrides(entry, rawStage as Stage | null)
      if (!stage) continue

      const stale = detectStale(entry, now)
      const filePath = stage === 'develop' ? entry.plan! : stage === 'plan' ? entry.spec! : entry.idea!

      upNext.push({
        projectId: project.id,
        projectName: project.name,
        featureName: entry.key,
        filePath,
        stage,
        auditStatus: stage === 'develop' ? auditLabel(entry.audit) : null,
        stale,
        status: entry.frontmatterStatus,
        _modified: entry.latestModified.toISOString(),
      } as DashboardResponse['upNext'][0] & { _modified: string })
    }
  }

  type UpNextWithSort = DashboardResponse['upNext'][0] & { _modified?: string }
  ;(upNext as UpNextWithSort[]).sort((a, b) => {
    const sa = STAGE_ORDER.indexOf(a.stage)
    const sb = STAGE_ORDER.indexOf(b.stage)
    if (sa !== sb) return sa - sb
    if (a.stale !== b.stale) return a.stale ? 1 : -1
    return (b._modified ?? '').localeCompare(a._modified ?? '')
  })
  for (const item of upNext as UpNextWithSort[]) { delete item._modified }

  health.worst.sort((a, b) => b.blockers - a.blockers || b.warnings - a.warnings)
  health.worst = health.worst.slice(0, 3)

  recentlyTouched.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
  recentlyTouched.splice(8)

  return { inProgress, upNext, pipeline, health, recentlyTouched }
}
