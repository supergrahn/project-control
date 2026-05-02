import { createHash } from 'crypto'
import type { Database } from 'better-sqlite3'
import { enqueueJob } from '@/lib/jobs/runner'
import { getDefaultLocalProvider } from '@/lib/db/providers'
import { getLocalEmbeddingModel } from '@/lib/router/localEmbed'
import { getLocalModelName } from '@/lib/router/localComplete'

type FileNode = { type: 'file'; relativePath: string; content?: string }
type FolderNode = { type: 'folder'; children?: Array<FileNode | FolderNode> }
type Node = FileNode | FolderNode

function isSpec(p: string): boolean {
  return p.startsWith('docs/superpowers/specs/')
}
function isPlan(p: string): boolean {
  return p.startsWith('docs/superpowers/plans/')
}

function walk(nodes: Node[], cb: (file: FileNode) => void): void {
  for (const n of nodes) {
    if (n.type === 'file') cb(n)
    else if (n.children) walk(n.children, cb)
  }
}

/**
 * Lazy embedding/critique trigger: invoked from the docs API after the
 * response has been constructed. Walks the tree, computes per-file hashes,
 * and enqueues `embed` (for any markdown) and `critique_spec`/`critique_plan`
 * (for files under `docs/superpowers/specs/` and `docs/superpowers/plans/`)
 * when content_hash or active embedding model has drifted.
 */
export function onDocsTreeRead(db: Database, projectId: string, nodes: Node[]): void {
  // Compute the active embedding model once per call so we can detect rows
  // that were embedded with a different model and re-enqueue them.
  const provider = getDefaultLocalProvider(db)
  const activeModel = provider ? getLocalEmbeddingModel(provider) : null
  const activeChatModel = provider ? getLocalModelName(provider) : null
  if (!activeModel) return // no provider configured → no point enqueuing embed jobs

  walk(nodes, (file) => {
    if (!file.content) return
    if (!file.relativePath.endsWith('.md') && !file.relativePath.endsWith('.mdx')) return
    const hash = createHash('sha256').update(file.content).digest('hex')
    const kind = isSpec(file.relativePath) ? 'spec' : isPlan(file.relativePath) ? 'plan' : 'doc'

    // Embed enqueue: stale on either content_hash OR model drift
    const existing = db
      .prepare(`SELECT content_hash, model FROM embeddings WHERE project_id = ? AND kind = ? AND ref = ?`)
      .get(projectId, kind, file.relativePath) as { content_hash: string; model: string } | undefined
    if (!existing || existing.content_hash !== hash || existing.model !== activeModel) {
      enqueueJob(
        db,
        'embed',
        { project_id: projectId, kind, ref: file.relativePath, content_hash: hash },
        { dedupKey: `embed:${projectId}:${kind}:${file.relativePath}` },
      )
    }

    // Critique enqueue: only specs/plans. Stale on content_hash OR chat-model drift.
    if (kind === 'spec' || kind === 'plan') {
      const existingCritic = db
        .prepare(`SELECT content_hash, findings FROM critic_findings WHERE project_id = ? AND kind = ? AND ref = ?`)
        .get(projectId, kind, file.relativePath) as { content_hash: string; findings: string } | undefined
      let existingModel: string | null = null
      if (existingCritic) {
        try { existingModel = (JSON.parse(existingCritic.findings) as { model?: string }).model ?? null } catch {}
      }
      if (!existingCritic || existingCritic.content_hash !== hash || (activeChatModel && existingModel !== activeChatModel)) {
        const jobKind = kind === 'spec' ? 'critique_spec' : 'critique_plan'
        enqueueJob(
          db,
          jobKind,
          { project_id: projectId, ref: file.relativePath, content_hash: hash },
          { dedupKey: `${jobKind}:${projectId}:${file.relativePath}` },
        )
      }
    }
  })
}
