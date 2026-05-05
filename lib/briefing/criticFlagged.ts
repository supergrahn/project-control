import type { Database } from 'better-sqlite3'
import type { BriefingCriticFlag } from './types'

export function getCriticFlagged(db: Database, options: { limit?: number; projectId?: string } = {}): BriefingCriticFlag[] {
  const limit = options.limit ?? 10
  const whereProject = options.projectId ? 'WHERE cf.project_id = ?' : ''
  const rows = db.prepare(`
    SELECT cf.id AS finding_id, cf.project_id, p.name AS project_name, cf.kind, cf.ref, cf.findings, cf.created_at
      FROM critic_findings cf
      JOIN projects p ON p.id = cf.project_id
     ${whereProject}
     ORDER BY cf.created_at DESC
     LIMIT 50
  `).all(...(options.projectId ? [options.projectId] : [])) as Array<{
    finding_id: number; project_id: string; project_name: string; kind: string; ref: string; findings: string; created_at: string;
  }>

  const out: BriefingCriticFlag[] = []
  for (const row of rows) {
    let parsed: unknown
    try { parsed = JSON.parse(row.findings) } catch { continue }
    const list = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { findings?: unknown[] })?.findings) ? (parsed as { findings: unknown[] }).findings : []
    for (const f of list) {
      if (!f || typeof f !== 'object') continue
      const sev = (f as { severity?: unknown }).severity
      if (sev !== 'critical' && sev !== 'high') continue
      const cat = String((f as { category?: unknown }).category ?? 'unknown')
      const msg = String((f as { message?: unknown }).message ?? '')
      out.push({
        findingId: row.finding_id,
        projectId: row.project_id,
        projectName: row.project_name,
        kind: row.kind,
        ref: row.ref,
        severity: sev as 'critical' | 'high',
        category: cat,
        message: msg,
        createdAt: row.created_at,
      })
      if (out.length >= limit) return out
    }
  }
  return out
}
