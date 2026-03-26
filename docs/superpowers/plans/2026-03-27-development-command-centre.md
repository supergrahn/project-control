# Development Command Centre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the root `/` redirect with a cross-project development command centre showing active sessions, actionable features, pipeline counts, and audit health.

**Architecture:** `lib/dashboard.ts` is the readiness engine (pure functions for stage inference, stale detection, feature mapping). A single `GET /api/dashboard` endpoint aggregates data across all projects server-side. The UI has three components: `InProgressBanner`, `UpNextTable`, `BottomStrip`.

**Tech Stack:** Next.js 16 App Router, TypeScript, TanStack Query v5, better-sqlite3, Tailwind v4, Vitest

**Spec:** `docs/superpowers/specs/2026-03-27-development-command-centre-design.md`

---

### Task 1: `lib/dashboard.ts` — pure functions (types, stripDatePrefix, inferStage, applyOverrides, detectStale)

**Files:**
- Create: `lib/dashboard.ts`
- Create: `tests/lib/dashboard.test.ts`

Start with the pure functions that have no filesystem dependency. `buildFeatureMap` and `buildDashboardData` come in Task 2.

- [ ] **Step 1: Create test file with pure function tests**

```typescript
// tests/lib/dashboard.test.ts
import { describe, it, expect } from 'vitest'
import { stripDatePrefix, inferStage, applyOverrides, detectStale, type FeatureEntry, type Stage } from '@/lib/dashboard'

function makeEntry(overrides: Partial<FeatureEntry> = {}): FeatureEntry {
  return {
    key: 'test-feature',
    originalBasenames: {},
    idea: null,
    spec: null,
    plan: null,
    audit: null,
    latestModified: new Date('2026-03-26'),
    frontmatterStatus: null,
    ...overrides,
  }
}

describe('stripDatePrefix', () => {
  it('strips YYYY-MM-DD- prefix', () => {
    expect(stripDatePrefix('2026-03-26-auth-system.md')).toBe('auth-system.md')
  })
  it('returns unchanged if no date prefix', () => {
    expect(stripDatePrefix('auth-system.md')).toBe('auth-system.md')
  })
  it('handles partial date-like prefix (no match)', () => {
    expect(stripDatePrefix('2026-03-auth.md')).toBe('2026-03-auth.md')
  })
  it('handles file that is only a date prefix', () => {
    expect(stripDatePrefix('2026-03-26-.md')).toBe('.md')
  })
})

describe('inferStage', () => {
  it('rule 1: plan + active session → inProgress', () => {
    const entry = makeEntry({ plan: '/p/plan.md' })
    expect(inferStage(entry, true)).toBe('inProgress')
  })
  it('rule 2: plan + clean audit + no session → develop', () => {
    const entry = makeEntry({ plan: '/p/plan.md', audit: { blockers: 0, warnings: 0 } })
    expect(inferStage(entry, false)).toBe('develop')
  })
  it('rule 3: plan + audit with issues → develop', () => {
    const entry = makeEntry({ plan: '/p/plan.md', audit: { blockers: 2, warnings: 0 } })
    expect(inferStage(entry, false)).toBe('develop')
  })
  it('rule 4: plan + no audit → develop', () => {
    const entry = makeEntry({ plan: '/p/plan.md' })
    expect(inferStage(entry, false)).toBe('develop')
  })
  it('rule 5: spec + no plan → plan', () => {
    const entry = makeEntry({ spec: '/p/spec.md' })
    expect(inferStage(entry, false)).toBe('plan')
  })
  it('rule 6: idea + no spec → spec', () => {
    const entry = makeEntry({ idea: '/p/idea.md' })
    expect(inferStage(entry, false)).toBe('spec')
  })
  it('returns null when no files', () => {
    const entry = makeEntry()
    expect(inferStage(entry, false)).toBeNull()
  })
})

describe('applyOverrides', () => {
  it('status: done → null (excluded)', () => {
    const entry = makeEntry({ idea: '/p/idea.md', frontmatterStatus: 'done' })
    expect(applyOverrides(entry, 'spec')).toBeNull()
  })
  it('status: skip → null (excluded)', () => {
    const entry = makeEntry({ idea: '/p/idea.md', frontmatterStatus: 'skip' })
    expect(applyOverrides(entry, 'spec')).toBeNull()
  })
  it('status: ready → preserves inferred stage', () => {
    const entry = makeEntry({ idea: '/p/idea.md', frontmatterStatus: 'ready' })
    expect(applyOverrides(entry, 'spec')).toBe('spec')
  })
  it('status: ready → forces stage when inferred was null', () => {
    const entry = makeEntry({ frontmatterStatus: 'ready', idea: '/p/idea.md' })
    expect(applyOverrides(entry, null)).toBe('spec')
  })
  it('status: in-progress → preserves inferred stage', () => {
    const entry = makeEntry({ plan: '/p/plan.md', frontmatterStatus: 'in-progress' })
    expect(applyOverrides(entry, 'develop')).toBe('develop')
  })
  it('no status → passes through inferred stage', () => {
    const entry = makeEntry({ spec: '/p/spec.md' })
    expect(applyOverrides(entry, 'plan')).toBe('plan')
  })
})

describe('detectStale', () => {
  it('returns true when >7 days old and no status override', () => {
    const entry = makeEntry({ plan: '/p/plan.md', latestModified: new Date('2026-03-10') })
    expect(detectStale(entry, new Date('2026-03-27'))).toBe(true)
  })
  it('returns false when <7 days old', () => {
    const entry = makeEntry({ plan: '/p/plan.md', latestModified: new Date('2026-03-25') })
    expect(detectStale(entry, new Date('2026-03-27'))).toBe(false)
  })
  it('returns false when stale but has status override', () => {
    const entry = makeEntry({ plan: '/p/plan.md', latestModified: new Date('2026-03-10'), frontmatterStatus: 'in-progress' })
    expect(detectStale(entry, new Date('2026-03-27'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

```bash
cd /home/tomespen/git/project-control && npm test -- tests/lib/dashboard.test.ts 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module '@/lib/dashboard'`

- [ ] **Step 3: Create `lib/dashboard.ts` with types and pure functions**

```typescript
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
    // Force a stage based on what files exist
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
```

- [ ] **Step 4: Run tests — expect all PASS**

```bash
cd /home/tomespen/git/project-control && npm test -- tests/lib/dashboard.test.ts 2>&1 | tail -20
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
cd /home/tomespen/git/project-control && git add lib/dashboard.ts tests/lib/dashboard.test.ts && git commit -m "feat: add lib/dashboard.ts types and pure functions (stripDatePrefix, inferStage, applyOverrides, detectStale)"
```

---

### Task 2: `lib/dashboard.ts` — filesystem functions (buildFeatureMap, buildDashboardData)

**Files:**
- Modify: `lib/dashboard.ts`
- Modify: `tests/lib/dashboard.test.ts`

Add the filesystem-dependent functions. Tests use temp directories.

- [ ] **Step 1: Add buildFeatureMap and buildDashboardData tests**

Append to `tests/lib/dashboard.test.ts`:

```typescript
import { buildFeatureMap } from '@/lib/dashboard'
import fss from 'fs'
import pathMod from 'path'
import os from 'os'
import { beforeEach, afterEach } from 'vitest'

describe('buildFeatureMap', () => {
  let tmpDir: string
  let ideasDir: string
  let specsDir: string
  let plansDir: string

  beforeEach(() => {
    tmpDir = fss.mkdtempSync(pathMod.join(os.tmpdir(), 'dashboard-test-'))
    ideasDir = pathMod.join(tmpDir, 'ideas')
    specsDir = pathMod.join(tmpDir, 'specs')
    plansDir = pathMod.join(tmpDir, 'plans')
    fss.mkdirSync(ideasDir, { recursive: true })
    fss.mkdirSync(specsDir, { recursive: true })
    fss.mkdirSync(plansDir, { recursive: true })
  })

  afterEach(() => {
    fss.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('maps files across dirs by stripped basename', () => {
    fss.writeFileSync(pathMod.join(ideasDir, 'auth-system.md'), '# Auth')
    fss.writeFileSync(pathMod.join(specsDir, '2026-03-26-auth-system.md'), '# Auth Spec')
    fss.writeFileSync(pathMod.join(plansDir, '2026-03-26-auth-system.md'), '# Auth Plan')

    const map = buildFeatureMap(tmpDir, { ideas_dir: 'ideas', specs_dir: 'specs', plans_dir: 'plans' })
    expect(map.size).toBe(1)
    const entry = map.get('auth-system')!
    expect(entry.idea).toContain('auth-system.md')
    expect(entry.spec).toContain('auth-system.md')
    expect(entry.plan).toContain('auth-system.md')
    expect(entry.originalBasenames.plan).toBe('2026-03-26-auth-system')
  })

  it('reads frontmatter status from files', () => {
    fss.writeFileSync(pathMod.join(ideasDir, 'done-feature.md'), '---\nstatus: done\n---\n# Done')

    const map = buildFeatureMap(tmpDir, { ideas_dir: 'ideas', specs_dir: 'specs', plans_dir: 'plans' })
    const entry = map.get('done-feature')!
    expect(entry.frontmatterStatus).toBe('done')
  })

  it('reads audit files for plans', () => {
    fss.writeFileSync(pathMod.join(plansDir, 'my-plan.md'), '# Plan')
    const auditsDir = pathMod.join(plansDir, 'audits')
    fss.mkdirSync(auditsDir, { recursive: true })
    fss.writeFileSync(pathMod.join(auditsDir, 'my-plan-audit-2026-03-26.md'), '---\nblockers: 2\nwarnings: 1\naudited_at: 2026-03-26\nplan_file: my-plan.md\n---\n\n# Audit')

    const map = buildFeatureMap(tmpDir, { ideas_dir: 'ideas', specs_dir: 'specs', plans_dir: 'plans' })
    const entry = map.get('my-plan')!
    expect(entry.audit).toEqual({ blockers: 2, warnings: 1 })
  })

  it('ignores non-.md files', () => {
    fss.writeFileSync(pathMod.join(ideasDir, 'notes.txt'), 'not markdown')
    fss.writeFileSync(pathMod.join(ideasDir, 'real-idea.md'), '# Real')

    const map = buildFeatureMap(tmpDir, { ideas_dir: 'ideas', specs_dir: 'specs', plans_dir: 'plans' })
    expect(map.size).toBe(1)
    expect(map.has('real-idea')).toBe(true)
  })

  it('returns empty map when dirs do not exist', () => {
    const map = buildFeatureMap(tmpDir, { ideas_dir: 'nonexistent', specs_dir: null, plans_dir: null })
    expect(map.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (buildFeatureMap not exported)**

```bash
cd /home/tomespen/git/project-control && npm test -- tests/lib/dashboard.test.ts 2>&1 | tail -20
```

- [ ] **Step 3: Implement buildFeatureMap and buildDashboardData in `lib/dashboard.ts`**

Append to `lib/dashboard.ts` after the existing code:

```typescript
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
      const planBasename = m[1] // original basename with date prefix
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

  // Scan each dir
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

      // Read frontmatter status from the furthest-stage file (plan > spec > idea)
      // Only set if this is the most advanced stage so far
      if (type === 'plan' || (type === 'spec' && !entry.plan) || (type === 'idea' && !entry.spec && !entry.plan)) {
        const status = readStatus(file.filePath)
        if (status) entry.frontmatterStatus = status
      }
    }
  }

  // Load audit data for plans
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
const STAGE_TO_DIR: Record<Stage, 'plans' | 'specs' | 'ideas'> = {
  develop: 'plans',
  plan: 'specs',
  spec: 'ideas',
}

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

  // Map active sessions to inProgress
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
      // Pipeline counts
      if (entry.idea) pipeline.ideas++
      if (entry.spec) pipeline.specs++
      if (entry.plan) pipeline.plans++

      // Health (per plan that exists)
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

      // Stage inference
      const hasActiveSession = entry.plan ? sessionSourceFiles.has(entry.plan) : false
      const rawStage = inferStage(entry, hasActiveSession)

      if (rawStage === 'inProgress') continue // already handled above

      const stage = applyOverrides(entry, rawStage as Stage | null)
      if (!stage) continue

      const stale = detectStale(entry, now)

      // Determine the file path for this feature at the current stage
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
        _modified: entry.latestModified.toISOString(), // internal sort key, stripped after sort
      } as DashboardResponse['upNext'][0] & { _modified: string })
    }
  }

  // Sort upNext: by stage order, then non-stale first, then most recently modified first
  type UpNextWithSort = DashboardResponse['upNext'][0] & { _modified?: string }
  ;(upNext as UpNextWithSort[]).sort((a, b) => {
    const sa = STAGE_ORDER.indexOf(a.stage)
    const sb = STAGE_ORDER.indexOf(b.stage)
    if (sa !== sb) return sa - sb
    if (a.stale !== b.stale) return a.stale ? 1 : -1
    return (b._modified ?? '').localeCompare(a._modified ?? '')
  })
  // Strip internal sort key
  for (const item of upNext as UpNextWithSort[]) { delete item._modified }

  // Sort health.worst: blockers desc, then warnings desc, limit 3
  health.worst.sort((a, b) => b.blockers - a.blockers || b.warnings - a.warnings)
  health.worst = health.worst.slice(0, 3)

  // Sort recentlyTouched by modifiedAt desc, limit 8
  recentlyTouched.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
  recentlyTouched.splice(8)

  return { inProgress, upNext, pipeline, health, recentlyTouched }
}
```

- [ ] **Step 4: Run tests — expect all PASS**

```bash
cd /home/tomespen/git/project-control && npm test -- tests/lib/dashboard.test.ts 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
cd /home/tomespen/git/project-control && git add lib/dashboard.ts tests/lib/dashboard.test.ts && git commit -m "feat: add buildFeatureMap and buildDashboardData to lib/dashboard.ts"
```

---

### Task 3: `app/api/dashboard/route.ts` — GET endpoint

**Files:**
- Create: `app/api/dashboard/route.ts`

- [ ] **Step 1: Create `app/api/dashboard/route.ts`**

```typescript
// app/api/dashboard/route.ts
import { NextResponse } from 'next/server'
import { getDb, listProjects, getActiveSessions } from '@/lib/db'
import { buildDashboardData } from '@/lib/dashboard'

export async function GET() {
  const db = getDb()
  const projects = listProjects(db)
  const activeSessions = getActiveSessions(db)
  const data = buildDashboardData(projects, activeSessions)
  return NextResponse.json(data)
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /home/tomespen/git/project-control && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /home/tomespen/git/project-control && git add app/api/dashboard/route.ts && git commit -m "feat: add GET /api/dashboard endpoint"
```

---

### Task 4: `hooks/useDashboard.ts`

**Files:**
- Create: `hooks/useDashboard.ts`

- [ ] **Step 1: Create `hooks/useDashboard.ts`**

```typescript
// hooks/useDashboard.ts
import { useQuery } from '@tanstack/react-query'
import type { DashboardResponse } from '@/lib/dashboard'

export function useDashboard() {
  return useQuery<DashboardResponse>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const r = await fetch('/api/dashboard')
      if (!r.ok) throw new Error(r.statusText)
      return r.json()
    },
    refetchInterval: 30000,
  })
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /home/tomespen/git/project-control && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /home/tomespen/git/project-control && git add hooks/useDashboard.ts && git commit -m "feat: add useDashboard hook"
```

---

### Task 5: `app/(dashboard)/page.tsx` — dashboard page with all components

**Files:**
- Create: `app/(dashboard)/page.tsx`
- Modify: `app/page.tsx` (remove redirect, or keep as fallback)

This is the main UI. It contains `InProgressBanner`, `UpNextTable`, and `BottomStrip` as sections within the page (not separate component files — they're small and tightly coupled).

- [ ] **Step 1: Create `app/(dashboard)/page.tsx`**

```typescript
// app/(dashboard)/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, ArrowRight } from 'lucide-react'
import { useDashboard } from '@/hooks/useDashboard'
import { useProjects, useProjectStore } from '@/hooks/useProjects'
import { useLaunchSession, type Session } from '@/hooks/useSessions'
import { PromptModal } from '@/components/PromptModal'
import { SessionModal } from '@/components/SessionModal'
import { formatDistanceToNow } from 'date-fns'
import type { Phase } from '@/lib/prompts'
import type { DashboardResponse } from '@/lib/dashboard'

const STAGE_COLORS: Record<string, string> = {
  develop: 'bg-green-500/20 text-green-300',
  plan: 'bg-violet-500/20 text-violet-300',
  spec: 'bg-blue-500/20 text-blue-300',
}

const STAGE_ACTIONS: Record<string, { label: string; route: string; phase?: Phase }> = {
  develop: { label: 'Start', route: '/plans', phase: 'develop' },
  plan: { label: 'Plan', route: '/specs' },
  spec: { label: 'Spec', route: '/ideas' },
}

const AUDIT_BADGES: Record<string, string> = {
  blockers: '🔴',
  warnings: '🟡',
  clean: '🟢',
}

function InProgressBanner({
  items,
  projectMap,
}: {
  items: DashboardResponse['inProgress']
  projectMap: Record<string, { id: string; name: string; path: string; ideas_dir: string | null; specs_dir: string | null; plans_dir: string | null; last_used_at: string | null }>
}) {
  const { openProject } = useProjectStore()
  const router = useRouter()

  if (items.length === 0) return null

  return (
    <div className="flex flex-col gap-2 mb-4">
      {items.map((s) => (
        <div
          key={s.sessionId}
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-violet-500/10 border border-violet-500/30 cursor-pointer hover:bg-violet-500/15 transition-colors"
          onClick={() => {
            const p = projectMap[s.projectId]
            if (p) { openProject(p); router.push('/developing') }
          }}
        >
          <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse shrink-0" />
          <span className="text-xs text-violet-300 font-semibold uppercase tracking-wider">In Progress</span>
          <span className="text-sm text-zinc-100 font-medium">{s.projectName}</span>
          <span className="text-sm text-zinc-400">{s.featureName}</span>
          <span className="text-xs text-zinc-500">{formatDistanceToNow(new Date(s.createdAt), { addSuffix: false })}</span>
          <span className="flex-1" />
          <span className="text-xs text-violet-400 flex items-center gap-1">
            Resume <ArrowRight size={12} />
          </span>
        </div>
      ))}
    </div>
  )
}

function UpNextTable({
  items,
  projectMap,
  onLaunchDevelop,
}: {
  items: DashboardResponse['upNext']
  projectMap: Record<string, { id: string; name: string; path: string; ideas_dir: string | null; specs_dir: string | null; plans_dir: string | null; last_used_at: string | null }>
  onLaunchDevelop: (projectId: string, sourceFile: string, featureName: string) => void
}) {
  const { openProject } = useProjectStore()
  const router = useRouter()

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center">
        <Activity size={28} className="text-zinc-700 mx-auto mb-3" />
        <p className="text-zinc-400 text-sm font-medium">All caught up</p>
        <p className="text-zinc-600 text-xs mt-1">No actionable features across your projects.</p>
      </div>
    )
  }

  const handleRowClick = (item: DashboardResponse['upNext'][0]) => {
    const p = projectMap[item.projectId]
    if (!p) return
    const action = STAGE_ACTIONS[item.stage]
    if (item.stage === 'develop') {
      onLaunchDevelop(item.projectId, item.filePath, item.featureName)
    } else {
      openProject(p)
      router.push(action.route)
    }
  }

  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
        <h2 className="text-sm font-semibold text-zinc-100">Up Next — Ready to Continue</h2>
      </div>
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_120px_140px_80px] px-4 py-2 border-b border-zinc-800/50">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Feature</span>
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Project</span>
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Stage</span>
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider" />
      </div>
      {items.map((item) => {
        const action = STAGE_ACTIONS[item.stage]
        return (
          <div
            key={`${item.projectId}-${item.featureName}`}
            className={`grid grid-cols-[1fr_120px_140px_80px] px-4 py-2.5 border-b border-zinc-800/30 cursor-pointer hover:bg-zinc-900/80 transition-colors items-center ${item.stale ? 'opacity-60' : ''}`}
            onClick={() => handleRowClick(item)}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-100">{item.featureName}</span>
              {item.stale && <span className="text-[10px] text-zinc-500">⏸ stale</span>}
              {item.status === 'in-progress' && <span className="text-[10px] text-amber-400">in progress</span>}
            </div>
            <span className="text-xs text-zinc-400">{item.projectName}</span>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STAGE_COLORS[item.stage]}`}>
                {item.stage}
              </span>
              {item.auditStatus && (
                <span className="text-xs">{AUDIT_BADGES[item.auditStatus]}</span>
              )}
            </div>
            <span className="text-xs text-violet-400 flex items-center gap-1">
              {action.label} <ArrowRight size={10} />
            </span>
          </div>
        )
      })}
    </div>
  )
}

function BottomStrip({ pipeline, health }: { pipeline: DashboardResponse['pipeline']; health: DashboardResponse['health'] }) {
  return (
    <div className="grid grid-cols-2 gap-3 mt-4">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Pipeline</span>
        <div className="flex items-center gap-4 mt-1.5">
          <span className="text-xs"><span className="text-zinc-100 font-semibold">{pipeline.ideas}</span> <span className="text-zinc-500">ideas</span></span>
          <span className="text-xs"><span className="text-zinc-100 font-semibold">{pipeline.specs}</span> <span className="text-zinc-500">specs</span></span>
          <span className="text-xs"><span className="text-zinc-100 font-semibold">{pipeline.plans}</span> <span className="text-zinc-500">plans</span></span>
          <span className="text-xs"><span className="text-violet-300 font-semibold">{pipeline.active}</span> <span className="text-zinc-500">active</span></span>
        </div>
      </div>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Audit Health</span>
        <div className="flex items-center gap-4 mt-1.5">
          <span className="text-xs"><span className="text-red-400 font-semibold">{health.blockers}</span> <span className="text-zinc-500">🔴</span></span>
          <span className="text-xs"><span className="text-amber-300 font-semibold">{health.warnings}</span> <span className="text-zinc-500">🟡</span></span>
          <span className="text-xs"><span className="text-green-300 font-semibold">{health.clean}</span> <span className="text-zinc-500">🟢</span></span>
          {health.worst.length > 0 && (
            <span className="text-[10px] text-zinc-500 ml-2">
              Worst: <span className="text-red-400">{health.worst[0].projectName} · {health.worst[0].blockers} blockers</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { data, isLoading, isError } = useDashboard()
  const { data: projects = [] } = useProjects()
  const { openProject } = useProjectStore()
  const router = useRouter()
  const launchSession = useLaunchSession()

  const [promptConfig, setPromptConfig] = useState<{ projectId: string; sourceFile: string; featureName: string } | null>(null)
  const [activeSession, setActiveSession] = useState<Session | null>(null)

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]))

  if (isLoading) return <p className="text-zinc-500 text-sm">Loading dashboard…</p>
  if (isError || !data) return <p className="text-zinc-500 text-sm">Failed to load dashboard.</p>

  const handleLaunchDevelop = (projectId: string, sourceFile: string, featureName: string) => {
    const p = projectMap[projectId]
    if (p) openProject(p)
    setPromptConfig({ projectId, sourceFile, featureName })
  }

  return (
    <>
      <InProgressBanner items={data.inProgress} projectMap={projectMap} />
      <UpNextTable items={data.upNext} projectMap={projectMap} onLaunchDevelop={handleLaunchDevelop} />
      <BottomStrip pipeline={data.pipeline} health={data.health} />

      {promptConfig && (
        <PromptModal
          phase="develop"
          sourceFile={promptConfig.sourceFile}
          onCancel={() => setPromptConfig(null)}
          onLaunch={async (userContext, permissionMode) => {
            const config = promptConfig
            setPromptConfig(null)
            try {
              const result = await launchSession.mutateAsync({
                projectId: config.projectId,
                phase: 'develop',
                sourceFile: config.sourceFile,
                userContext,
                permissionMode,
              })
              if (result.sessionId) {
                setActiveSession({
                  id: result.sessionId,
                  label: `${config.featureName} · develop`,
                  phase: 'develop',
                  project_id: config.projectId,
                  source_file: config.sourceFile,
                  status: 'active',
                  created_at: new Date().toISOString(),
                  ended_at: null,
                })
              }
            } catch {}
          }}
        />
      )}
      <SessionModal session={activeSession} onClose={() => setActiveSession(null)} />
    </>
  )
}
```

- [ ] **Step 2: Update `app/page.tsx` to redirect to dashboard**

The root `app/page.tsx` currently redirects to `/ideas`. Since the dashboard now lives at `app/(dashboard)/page.tsx` (which is the `/` route in the dashboard layout group), we no longer need the redirect. Delete or replace `app/page.tsx`:

```typescript
// app/page.tsx
import { redirect } from 'next/navigation'
// The dashboard is served by app/(dashboard)/page.tsx
// This file exists only if Next.js needs a root page outside the layout group.
// If app/(dashboard)/page.tsx handles /, this file can redirect as a fallback.
export default function Home() { redirect('/') }
```

Actually — `app/(dashboard)/page.tsx` maps to `/` because `(dashboard)` is a route group (parenthesized), so it IS the root route. The existing `app/page.tsx` would conflict. **Delete `app/page.tsx`** since the new `app/(dashboard)/page.tsx` takes over the `/` route.

```bash
rm app/page.tsx
```

- [ ] **Step 3: TypeScript check**

```bash
cd /home/tomespen/git/project-control && npx tsc --noEmit 2>&1 | head -20
```

Fix any TypeScript errors.

- [ ] **Step 4: Commit**

```bash
cd /home/tomespen/git/project-control && git add app/\(dashboard\)/page.tsx && git rm app/page.tsx && git commit -m "feat: add Development Command Centre dashboard page, remove /ideas redirect"
```

---

### Task 6: Add "Dashboard" nav link to TopNav

**Files:**
- Modify: `components/nav/TopNav.tsx`

- [ ] **Step 1: Update NAV_ITEMS**

In `components/nav/TopNav.tsx`, find the `NAV_ITEMS` array and add Dashboard as the first entry:

```typescript
const NAV_ITEMS = [
  { label: 'Dashboard', href: '/' },
  { label: 'Ideas', href: '/ideas' },
  { label: 'Specs', href: '/specs' },
  { label: 'Plans', href: '/plans' },
  { label: 'Developing', href: '/developing' },
  { label: 'Memory', href: '/memory' },
]
```

**Important:** The active state detection uses `pathname.startsWith(t.href)`. Since `/` is a prefix of everything, the Dashboard link would always appear active. Fix by using exact match for `/`:

Find the active state check (likely `pathname.startsWith(t.href)`) and change it to:
```typescript
const isActive = t.href === '/' ? pathname === '/' : pathname.startsWith(t.href)
```

- [ ] **Step 2: TypeScript check**

```bash
cd /home/tomespen/git/project-control && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /home/tomespen/git/project-control && git add components/nav/TopNav.tsx && git commit -m "feat: add Dashboard link to top nav"
```

---

### Final verification

- [ ] Open http://localhost:3001/ — dashboard should show Up Next table, pipeline counts, audit health
- [ ] If any project has active sessions, In Progress banner appears at top with "Resume →"
- [ ] Up Next rows show features sorted by stage (develop first, then plan, then spec)
- [ ] Clicking "Start →" on a develop-ready item opens the PromptModal
- [ ] Clicking other rows opens the project tab and navigates to the correct page
- [ ] Bottom strip shows pipeline counts and health summary
- [ ] "Dashboard" link in nav is active only on `/`, not on other pages
