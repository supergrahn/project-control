import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { findSimilar } from '@/lib/embeddings/search'

type SimilarRequest = {
  kind: string
  ref: string
  resultKinds?: string[]
  limit?: number
}

// POST /api/projects/:id/embeddings/similar
//
// Body: { kind, ref, resultKinds?, limit? }
// Looks up the embedding row for the (project, kind, ref) source and returns
// the closest matches across resultKinds (defaults to all). Returns [] if the
// source isn't embedded yet — the caller treats that as "no panel" rather than
// an error so the UI can render in advance of the embed handler completing.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  let body: SimilarRequest
  try {
    body = (await req.json()) as SimilarRequest
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  if (!body || typeof body.kind !== 'string' || typeof body.ref !== 'string') {
    return NextResponse.json({ error: 'kind and ref required' }, { status: 400 })
  }

  const db = getDb()
  const row = db
    .prepare(
      `SELECT vector, dim, model FROM embeddings WHERE project_id = ? AND kind = ? AND ref = ?`,
    )
    .get(projectId, body.kind, body.ref) as
    | { vector: Buffer; dim: number; model: string }
    | undefined

  if (!row) return NextResponse.json([])

  const queryVector = new Float32Array(
    row.vector.buffer,
    row.vector.byteOffset,
    row.vector.byteLength / 4,
  )

  const matches = findSimilar(db, {
    projectId,
    queryVector,
    queryDim: row.dim,
    queryModel: row.model,
    kinds: body.resultKinds,
    limit: body.limit ?? 5,
    excludeRef: body.ref,
  })

  return NextResponse.json(matches)
}
