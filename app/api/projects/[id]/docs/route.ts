import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getDb, getProject } from '@/lib/db'
import { onDocsTreeRead } from '@/lib/jobs/triggers/onDocsTreeRead'

type DocsTreeNode = {
  type: 'folder' | 'file'
  name: string
  relativePath: string
  size: number
  modifiedAt: string
  content?: string
  children?: DocsTreeNode[]
}

const SKIP_DIRS = new Set([
  '.git',
  '.next',
  '.turbo',
  '.cache',
  '.vercel',
  '.parcel-cache',
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
])
const MARKDOWN_EXTS = new Set(['.md', '.mdx'])
const MAX_DEPTH = 12

function toRelative(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join('/')
}

function readNode(root: string, filePath: string, depth: number): DocsTreeNode | null {
  const name = path.basename(filePath)
  if (name.startsWith('.')) return null

  let stat: fs.Stats
  try {
    stat = fs.lstatSync(filePath)
  } catch {
    return null
  }
  if (stat.isSymbolicLink()) return null
  const relativePath = toRelative(root, filePath)

  if (stat.isDirectory()) {
    if (SKIP_DIRS.has(name) || depth >= MAX_DEPTH) return null
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(filePath, { withFileTypes: true })
    } catch {
      return null
    }
    const children = entries
      .map((entry) => readNode(root, path.join(filePath, entry.name), depth + 1))
      .filter((node): node is DocsTreeNode => node !== null)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
        return a.name.localeCompare(b.name)
      })

    if (children.length === 0) return null

    return {
      type: 'folder',
      name,
      relativePath,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      children,
    }
  }

  if (!stat.isFile()) return null
  const ext = path.extname(name).toLowerCase()
  if (!MARKDOWN_EXTS.has(ext)) return null

  return {
    type: 'file',
    name,
    relativePath,
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    content: fs.readFileSync(filePath, 'utf8'),
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const project = getProject(getDb(), id)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  const projectRoot = path.resolve(project.path)
  if (!fs.existsSync(projectRoot)) {
    return NextResponse.json({ nodes: [] })
  }

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(projectRoot, { withFileTypes: true })
  } catch {
    return NextResponse.json({ nodes: [] })
  }

  const nodes = entries
    .map((entry) => readNode(projectRoot, path.join(projectRoot, entry.name), 0))
    .filter((node): node is DocsTreeNode => node !== null)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

  // Reflective-workflow: enqueue embed + critique jobs lazily based on what's
  // in the tree. Run after the response is constructed via setImmediate so
  // the user-facing request isn't blocked.
  setImmediate(() => {
    try {
      onDocsTreeRead(getDb(), id, nodes)
    } catch (e) {
      console.warn('[docs trigger]', e)
    }
  })

  return NextResponse.json({ nodes })
}
