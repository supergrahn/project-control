import { NextResponse } from 'next/server'
import { getDb, getProject } from '@/lib/db'
import fs from 'fs'
import path from 'path'

type Dir = 'ideas' | 'specs' | 'plans'
const DIR_MAP: Record<Dir, 'ideas_dir' | 'specs_dir' | 'plans_dir'> = {
  ideas: 'ideas_dir',
  specs: 'specs_dir',
  plans: 'plans_dir',
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  const dir = searchParams.get('dir') as Dir

  if (!projectId || !dir || !DIR_MAP[dir]) {
    return NextResponse.json({ error: 'projectId and dir required' }, { status: 400 })
  }

  const project = getProject(getDb(), projectId)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  const relDir = project[DIR_MAP[dir]] as string | null
  if (!relDir) return NextResponse.json(null)

  const absDir = path.resolve(project.path, relDir)
  const projectRoot = path.resolve(project.path)
  if (!absDir.startsWith(projectRoot + path.sep) && absDir !== projectRoot) {
    return NextResponse.json({ error: 'invalid dir' }, { status: 400 })
  }
  if (!fs.existsSync(absDir)) return NextResponse.json([])

  const files = fs.readdirSync(absDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const filePath = path.join(absDir, f)
      const content = fs.readFileSync(filePath, 'utf8')
      const titleMatch = content.match(/^#\s+(.+)$/m)
      const excerptMatch = content.split('\n').find((l) => l.trim() && !l.startsWith('#'))
      const stat = fs.statSync(filePath)
      return {
        filename: f,
        path: filePath,
        title: titleMatch?.[1] ?? f.replace('.md', ''),
        excerpt: excerptMatch?.trim() ?? '',
        modifiedAt: stat.mtime.toISOString(),
        content,
      }
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))

  return NextResponse.json(files)
}

export async function POST(req: Request) {
  const { projectId, dir, name } = await req.json()
  if (!projectId || !dir || !name) {
    return NextResponse.json({ error: 'projectId, dir, and name required' }, { status: 400 })
  }

  if (!DIR_MAP[dir as Dir]) {
    return NextResponse.json({ error: 'invalid dir' }, { status: 400 })
  }

  const project = getProject(getDb(), projectId)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  const relDir = project[DIR_MAP[dir as Dir]] as string | null
  if (!relDir) return NextResponse.json({ error: `${dir}_dir not configured` }, { status: 400 })

  const absDir = path.resolve(project.path, relDir)
  const projectRoot = path.resolve(project.path)
  if (!absDir.startsWith(projectRoot + path.sep) && absDir !== projectRoot) {
    return NextResponse.json({ error: 'invalid dir' }, { status: 400 })
  }
  fs.mkdirSync(absDir, { recursive: true })

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  let filename = `${slug}.md`
  let counter = 2
  while (fs.existsSync(path.join(absDir, filename))) {
    filename = `${slug}-${counter++}.md`
  }

  const filePath = path.join(absDir, filename)
  fs.writeFileSync(filePath, `# ${name}\n\n`)

  return NextResponse.json({ filename, path: filePath })
}
