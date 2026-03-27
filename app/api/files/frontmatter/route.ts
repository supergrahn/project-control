import { NextResponse } from 'next/server'
import fs from 'fs'
import { writeFrontmatter } from '@/lib/frontmatter'

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body.filePath !== 'string' || typeof body.updates !== 'object') {
    return NextResponse.json({ error: 'filePath and updates required' }, { status: 400 })
  }

  const { filePath, updates } = body as { filePath: string; updates: Record<string, string | null> }

  // Security: must be an absolute path to a .md file
  if (!filePath.startsWith('/') || !filePath.endsWith('.md')) {
    return NextResponse.json({ error: 'invalid filePath' }, { status: 400 })
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'file not found' }, { status: 404 })
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const updated = writeFrontmatter(content, updates)
  fs.writeFileSync(filePath, updated, 'utf8')

  return NextResponse.json({ ok: true })
}
