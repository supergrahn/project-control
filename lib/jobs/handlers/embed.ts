import type Database from 'better-sqlite3'
import { createHash } from 'crypto'
import { loadContent, type EmbedKind } from '@/lib/embeddings/loadContent'
import { localEmbed } from '@/lib/router/localEmbed'
import { getDefaultLocalProvider } from '@/lib/db/providers'

export type EmbedPayload = {
  project_id: string
  kind: EmbedKind
  ref: string
  content_hash: string
}

export async function handleEmbed(
  db: Database.Database,
  payload: EmbedPayload,
): Promise<void> {
  const provider = getDefaultLocalProvider(db)
  if (!provider) {
    console.warn('[embed] no local provider configured; skipping')
    return
  }

  const content = loadContent(db, payload.project_id, payload.kind, payload.ref)
  if (content === null) {
    console.warn(
      `[embed] content not found for ${payload.kind}:${payload.ref}; skipping`,
    )
    return
  }

  const currentHash = createHash('sha256').update(content).digest('hex')
  if (currentHash !== payload.content_hash) {
    console.warn(
      `[embed] content_hash drift for ${payload.kind}:${payload.ref}; skipping (next trigger will re-enqueue)`,
    )
    return
  }

  const { embeddings, model, dim } = await localEmbed(provider, [content], {
    timeoutMs: 30_000,
  })
  const vec = embeddings[0]
  const buf = Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength)

  db.prepare(
    `
    INSERT INTO embeddings (project_id, kind, ref, content_hash, vector, dim, model, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, kind, ref) DO UPDATE SET
      content_hash = excluded.content_hash,
      vector = excluded.vector,
      dim = excluded.dim,
      model = excluded.model,
      updated_at = excluded.updated_at
  `,
  ).run(
    payload.project_id,
    payload.kind,
    payload.ref,
    currentHash,
    buf,
    dim,
    model,
    new Date().toISOString(),
  )
}
