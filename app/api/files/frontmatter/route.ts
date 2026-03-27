import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { writeFrontmatter } from '@/lib/frontmatter'

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body.filePath !== 'string' || !body.updates || typeof body.updates !== 'object') {
    return NextResponse.json({ error: 'filePath and updates required' }, { status: 400 })
  }

  const { filePath, updates } = body as { filePath: string; updates: Record<string, string | null> }

  const resolved = path.resolve(filePath)
  if (!resolved.startsWith('/') || !resolved.endsWith('.md')) {
    return NextResponse.json({ error: 'invalid filePath' }, { status: 400 })
  }

  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: 'file not found' }, { status: 404 })
  }

  try {
    const content = fs.readFileSync(resolved, 'utf8')
    const updated = writeFrontmatter(content, updates)
    fs.writeFileSync(resolved, updated, 'utf8')
  } catch {
    return NextResponse.json({ error: 'failed to update file' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
