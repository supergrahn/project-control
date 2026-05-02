import type Database from 'better-sqlite3'

export type SimilarMatch = { kind: string; ref: string; score: number }

export function findSimilar(
  db: Database.Database,
  opts: {
    projectId: string
    queryVector: Float32Array
    queryDim: number
    queryModel: string
    kinds?: string[]
    limit?: number
    excludeRef?: string
  },
): SimilarMatch[] {
  const kinds = opts.kinds ?? ['doc', 'spec', 'plan', 'session_summary', 'task']
  const placeholders = kinds.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT kind, ref, vector FROM embeddings
       WHERE project_id = ? AND model = ? AND dim = ? AND kind IN (${placeholders})
         ${opts.excludeRef ? 'AND ref != ?' : ''}`,
    )
    .all(
      opts.projectId,
      opts.queryModel,
      opts.queryDim,
      ...kinds,
      ...(opts.excludeRef ? [opts.excludeRef] : []),
    ) as Array<{ kind: string; ref: string; vector: Buffer }>

  // Pre-compute query norm
  const qNorm = Math.sqrt(opts.queryVector.reduce((s, x) => s + x * x, 0))
  if (qNorm === 0) return []

  const scored: SimilarMatch[] = rows.map((row) => {
    const buf = row.vector
    const v = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
    let dot = 0
    let vNorm = 0
    for (let i = 0; i < opts.queryDim; i++) {
      dot += opts.queryVector[i] * v[i]
      vNorm += v[i] * v[i]
    }
    const score = vNorm > 0 ? dot / (qNorm * Math.sqrt(vNorm)) : 0
    return { kind: row.kind, ref: row.ref, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, opts.limit ?? 10)
}
