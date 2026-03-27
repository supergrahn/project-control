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

export async function POST(req: Request) {
  const { projectId, sourceFile, targetDir } = await req.json()

  if (!projectId || !sourceFile || !targetDir || !DIR_MAP[targetDir as Dir]) {
    return NextResponse.json({ error: 'projectId, sourceFile, and targetDir required' }, { status: 400 })
  }

  const project = getProject(getDb(), projectId)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  const projectRoot = path.resolve(project.path)
  const absSource = path.resolve(sourceFile)
  if (!absSource.startsWith(projectRoot + path.sep) && absSource !== projectRoot) {
    return NextResponse.json({ error: 'source file outside project' }, { status: 400 })
  }
  if (!fs.existsSync(absSource)) {
    return NextResponse.json({ error: 'source file not found' }, { status: 404 })
  }

  const relTargetDir = project[DIR_MAP[targetDir as Dir]] as string | null
  if (!relTargetDir) return NextResponse.json({ error: `${targetDir}_dir not configured` }, { status: 422 })

  const absTargetDir = path.resolve(project.path, relTargetDir)
  if (!absTargetDir.startsWith(projectRoot + path.sep) && absTargetDir !== projectRoot) {
    return NextResponse.json({ error: 'invalid target dir' }, { status: 400 })
  }
  fs.mkdirSync(absTargetDir, { recursive: true })

  const basename = path.basename(absSource)
  let destFilename = basename
  let counter = 2
  while (fs.existsSync(path.join(absTargetDir, destFilename))) {
    const ext = path.extname(basename)
    const name = path.basename(basename, ext)
    destFilename = `${name}-${counter++}${ext}`
  }

  const destPath = path.join(absTargetDir, destFilename)
  fs.copyFileSync(absSource, destPath)

  return NextResponse.json({ filename: destFilename, path: destPath })
}
