import { describe, it, expect, beforeEach } from 'vitest'
import { initDb } from '@/lib/db'
import { getCriticFlagged } from '../criticFlagged'

function insertProject(db: ReturnType<typeof initDb>, id: string, name = id) {
  db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)').run(id, name, `/tmp/${id}`, new Date().toISOString())
}

function insertCriticFindings(db: ReturnType<typeof initDb>, opts: {
  projectId: string
  kind?: string
  ref?: string
  findings: unknown[]
  createdAt?: string
}) {
  const findings = JSON.stringify(opts.findings)
  db.prepare(`INSERT INTO critic_findings (project_id, kind, ref, content_hash, findings, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`).run(
    opts.projectId,
    opts.kind ?? 'spec',
    opts.ref ?? 'docs/spec.md',
    'hash-' + Math.random(),
    findings,
    opts.createdAt ?? '2026-05-04T00:00:00.000Z',
  )
}

describe('getCriticFlagged', () => {
  let db: ReturnType<typeof initDb>

  beforeEach(() => {
    db = initDb(':memory:')
    insertProject(db, 'p1', 'Project One')
  })

  it('returns empty when no rows', () => {
    expect(getCriticFlagged(db)).toEqual([])
  })

  it('returns critical and high findings', () => {
    insertCriticFindings(db, {
      projectId: 'p1',
      findings: [
        { severity: 'critical', category: 'security', message: 'SQL injection' },
        { severity: 'high', category: 'design', message: 'Missing validation' },
      ],
    })
    const out = getCriticFlagged(db)
    expect(out).toHaveLength(2)
    expect(out[0].severity).toBe('critical')
    expect(out[1].severity).toBe('high')
  })

  it('skips medium and low severity findings', () => {
    insertCriticFindings(db, {
      projectId: 'p1',
      findings: [
        { severity: 'medium', category: 'style', message: 'Formatting issue' },
        { severity: 'low', category: 'style', message: 'Minor issue' },
      ],
    })
    expect(getCriticFlagged(db)).toEqual([])
  })

  it('handles object-wrapped findings shape {findings: [...]}', () => {
    const findingsObj = {
      findings: [
        { severity: 'critical', category: 'arch', message: 'Wrong pattern' },
      ],
    }
    db.prepare(`INSERT INTO critic_findings (project_id, kind, ref, content_hash, findings, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`).run(
      'p1', 'plan', 'docs/plan.md', 'hash-wrapped', JSON.stringify(findingsObj), '2026-05-04T00:00:00.000Z',
    )
    const out = getCriticFlagged(db)
    expect(out).toHaveLength(1)
    expect(out[0].message).toBe('Wrong pattern')
  })

  it('includes projectName, kind, ref in results', () => {
    insertCriticFindings(db, {
      projectId: 'p1',
      kind: 'plan',
      ref: 'docs/plans/feature.md',
      findings: [{ severity: 'high', category: 'design', message: 'Over-engineered' }],
    })
    const out = getCriticFlagged(db)
    expect(out[0].projectName).toBe('Project One')
    expect(out[0].kind).toBe('plan')
    expect(out[0].ref).toBe('docs/plans/feature.md')
  })

  it('orders by created_at DESC', () => {
    insertCriticFindings(db, {
      projectId: 'p1',
      ref: 'old.md',
      findings: [{ severity: 'high', category: 'design', message: 'Old issue' }],
      createdAt: '2026-05-01T00:00:00.000Z',
    })
    insertCriticFindings(db, {
      projectId: 'p1',
      ref: 'new.md',
      findings: [{ severity: 'critical', category: 'security', message: 'New issue' }],
      createdAt: '2026-05-04T00:00:00.000Z',
    })
    const out = getCriticFlagged(db)
    expect(out[0].ref).toBe('new.md')
    expect(out[1].ref).toBe('old.md')
  })

  it('respects limit option', () => {
    // Insert many findings
    for (let i = 0; i < 15; i++) {
      insertCriticFindings(db, {
        projectId: 'p1',
        ref: `file${i}.md`,
        findings: [{ severity: 'critical', category: 'security', message: `Issue ${i}` }],
        createdAt: `2026-05-04T00:0${String(i).padStart(2, '0')}:00.000Z`,
      })
    }
    expect(getCriticFlagged(db, { limit: 5 })).toHaveLength(5)
  })

  it('skips malformed JSON findings', () => {
    db.prepare(`INSERT INTO critic_findings (project_id, kind, ref, content_hash, findings, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`).run(
      'p1', 'spec', 'bad.md', 'hash-bad', 'not-valid-json', '2026-05-04T00:00:00.000Z',
    )
    expect(getCriticFlagged(db)).toEqual([])
  })

  it('filters by projectId when provided', () => {
    insertProject(db, 'p2', 'Project Two')
    insertCriticFindings(db, {
      projectId: 'p1',
      findings: [{ severity: 'critical', category: 'security', message: 'Issue in p1' }],
    })
    insertCriticFindings(db, {
      projectId: 'p2',
      findings: [{ severity: 'high', category: 'design', message: 'Issue in p2' }],
    })
    const out = getCriticFlagged(db, { projectId: 'p1' })
    expect(out.every(x => x.projectId === 'p1')).toBe(true)
    expect(out.length).toBeGreaterThan(0)
  })

  it('populates findingId from critic_findings.id', () => {
    insertCriticFindings(db, {
      projectId: 'p1',
      findings: [{ severity: 'critical', category: 'security', message: 'SQL injection' }],
    })
    const out = getCriticFlagged(db)
    expect(typeof out[0].findingId).toBe('number')
    expect(out[0].findingId).toBeGreaterThan(0)
  })
})
