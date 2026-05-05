import type { Database } from 'better-sqlite3'
import type { BriefingDuplicate } from './types'

function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export function getDuplicateTasks(db: Database, options: { threshold?: number; limit?: number; perProjectCap?: number; projectId?: string } = {}): BriefingDuplicate[] {
  const threshold = options.threshold ?? 0.85
  const limit = options.limit ?? 5
  const perProjectCap = options.perProjectCap ?? 100

  // Load all dismissals once for O(1) lookup during pairwise loop
  const dismissed = db.prepare(`SELECT project_id, a_task_id, b_task_id FROM dedup_dismissals`).all() as Array<{ project_id: string; a_task_id: string; b_task_id: string }>
  const dismissedSet = new Set(dismissed.map(d => `${d.project_id}:${d.a_task_id}::${d.b_task_id}`))

  const whereProject = options.projectId ? 'AND e.project_id = ?' : ''
  const projects = db.prepare(`
    SELECT DISTINCT e.project_id, p.name AS project_name
      FROM embeddings e JOIN projects p ON p.id = e.project_id
     WHERE e.kind = 'task'
       ${whereProject}
  `).all(...(options.projectId ? [options.projectId] : [])) as Array<{ project_id: string; project_name: string }>

  const candidates: BriefingDuplicate[] = []
  for (const proj of projects) {
    const rows = db.prepare(`
      SELECT e.ref AS task_id, e.vector, e.dim, e.model, t.title
        FROM embeddings e
        JOIN tasks t ON t.id = e.ref
       WHERE e.project_id = ? AND e.kind = 'task'
       ORDER BY e.updated_at DESC
       LIMIT ?
    `).all(proj.project_id, perProjectCap) as Array<{ task_id: string; vector: Buffer; dim: number; model: string; title: string }>

    // Group by (model, dim) to ensure cosine compares apples to apples
    const groups = new Map<string, typeof rows>()
    for (const r of rows) {
      const key = `${r.model}::${r.dim}`
      const arr = groups.get(key) ?? []
      arr.push(r)
      groups.set(key, arr)
    }

    for (const group of groups.values()) {
      // Decode all vectors
      const decoded = group.map(r => ({
        ...r,
        vec: new Float32Array(r.vector.buffer, r.vector.byteOffset, r.vector.byteLength / 4),
      }))
      for (let i = 0; i < decoded.length; i++) {
        for (let j = i + 1; j < decoded.length; j++) {
          const sim = cosine(decoded[i].vec, decoded[j].vec)
          if (sim >= threshold) {
            // Canonicalise the pair (lex sort) — dismissals are stored in canonical order
            const sorted = [decoded[i].task_id, decoded[j].task_id].sort()
            const aId = sorted[0]
            const bId = sorted[1]
            if (dismissedSet.has(`${proj.project_id}:${aId}::${bId}`)) continue
            candidates.push({
              aTaskId: aId,
              bTaskId: bId,
              aTitle: aId === decoded[i].task_id ? decoded[i].title : decoded[j].title,
              bTitle: bId === decoded[j].task_id ? decoded[j].title : decoded[i].title,
              projectId: proj.project_id,
              projectName: proj.project_name,
              similarity: sim,
            })
          }
        }
      }
    }
  }
  candidates.sort((a, b) => b.similarity - a.similarity)
  return candidates.slice(0, limit)
}
