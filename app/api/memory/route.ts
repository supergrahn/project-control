// app/api/memory/route.ts
import { NextResponse } from 'next/server'
import { getDb, getProject } from '@/lib/db'
import { resolveMemoryDir, listMemoryFiles } from '@/lib/memory'
import fs from 'fs'
import path from 'path'

const FILENAME_RE = /^[\w-]+\.md$/

function getMemoryDir(projectId: string): { memoryDir: string; error?: never } | { memoryDir?: never; error: NextResponse } {
  const project = getProject(getDb(), projectId)
  if (!project) return { error: NextResponse.json({ error: 'project not found' }, { status: 404 }) }
  const memoryDir = resolveMemoryDir(project.path)
  if (!memoryDir) return { error: NextResponse.json(null) }
  return { memoryDir }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  const { memoryDir, error } = getMemoryDir(projectId)
  if (error) return error

  return NextResponse.json(listMemoryFiles(memoryDir))
}

export async function PUT(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  const filename = searchParams.get('filename')

  if (!projectId || !filename) return NextResponse.json({ error: 'projectId and filename required' }, { status: 400 })
  if (!FILENAME_RE.test(filename)) return NextResponse.json({ error: 'invalid filename' }, { status: 400 })

  const { memoryDir, error } = getMemoryDir(projectId)
  if (error) return error

  const destPath = path.resolve(memoryDir, filename)
  if (!destPath.startsWith(memoryDir + path.sep)) {
    return NextResponse.json({ error: 'path traversal detected' }, { status: 400 })
  }

  const { content } = await req.json()
  if (typeof content !== 'string') return NextResponse.json({ error: 'content must be a string' }, { status: 400 })

  const tmpPath = destPath + '.tmp'
  fs.writeFileSync(tmpPath, content, 'utf8')
  fs.renameSync(tmpPath, destPath)

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  const filename = searchParams.get('filename')

  if (!projectId || !filename) return NextResponse.json({ error: 'projectId and filename required' }, { status: 400 })
  if (!FILENAME_RE.test(filename)) return NextResponse.json({ error: 'invalid filename' }, { status: 400 })

  const { memoryDir, error } = getMemoryDir(projectId)
  if (error) return error

  const targetPath = path.resolve(memoryDir, filename)
  if (!targetPath.startsWith(memoryDir + path.sep)) {
    return NextResponse.json({ error: 'path traversal detected' }, { status: 400 })
  }

  if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath)

  // Best-effort: remove matching line from MEMORY.md index
  const indexPath = path.join(memoryDir, 'MEMORY.md')
  if (fs.existsSync(indexPath)) {
    const lines = fs.readFileSync(indexPath, 'utf8').split('\n')
    const filtered = lines.filter(l => !l.includes(`(${filename})`))
    if (filtered.length !== lines.length) {
      const tmpIndex = indexPath + '.tmp'
      fs.writeFileSync(tmpIndex, filtered.join('\n'), 'utf8')
      fs.renameSync(tmpIndex, indexPath)
    }
  }

  return NextResponse.json({ ok: true })
}
