import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

import { GET } from '@/app/api/projects/[id]/docs/route'
import { createProject, getDb } from '@/lib/db'

const p = (id: string) => ({ params: Promise.resolve({ id }) })

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-docs-'))
  getDb().prepare('DELETE FROM projects').run()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('GET /api/projects/[id]/docs', () => {
  it('returns empty nodes when the project has no markdown files', async () => {
    const projectId = createProject(getDb(), { name: 'Docs Test', path: tmpDir })
    const res = await GET(new NextRequest(`http://localhost/api/projects/${projectId}/docs`), p(projectId))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ nodes: [] })
  })

  it('returns root-level markdown files with no folder wrapper', async () => {
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Readme\n')
    fs.writeFileSync(path.join(tmpDir, 'NOTES.md'), '# Notes\n')

    const projectId = createProject(getDb(), { name: 'Docs Test', path: tmpDir })
    const res = await GET(new NextRequest(`http://localhost/api/projects/${projectId}/docs`), p(projectId))
    const body = await res.json()

    expect(body.nodes.map((n: any) => n.name)).toEqual(['NOTES.md', 'README.md'])
    expect(body.nodes[1].relativePath).toBe('README.md')
    expect(body.nodes[1].content).toBe('# Readme\n')
  })

  it('walks the entire project, pruning folders without markdown', async () => {
    fs.mkdirSync(path.join(tmpDir, 'docs', 'guides'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'packages', 'api'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'src', 'components'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Readme\n')
    fs.writeFileSync(path.join(tmpDir, 'docs', 'overview.md'), '# Overview\n')
    fs.writeFileSync(path.join(tmpDir, 'docs', 'guides', 'setup.md'), '# Setup\n')
    fs.writeFileSync(path.join(tmpDir, 'packages', 'api', 'README.md'), '# API\n')
    fs.writeFileSync(path.join(tmpDir, 'src', 'components', 'Button.tsx'), 'export {}')

    const projectId = createProject(getDb(), { name: 'Docs Test', path: tmpDir })
    const res = await GET(new NextRequest(`http://localhost/api/projects/${projectId}/docs`), p(projectId))
    const body = await res.json()

    expect(body.nodes.map((n: any) => n.name)).toEqual(['docs', 'packages', 'README.md'])
    const docs = body.nodes.find((n: any) => n.name === 'docs')
    expect(docs.children.map((c: any) => c.name)).toEqual(['guides', 'overview.md'])
    expect(docs.children[0].children[0].relativePath).toBe('docs/guides/setup.md')
    expect(docs.children[0].children[0].content).toBe('# Setup\n')
    const packages = body.nodes.find((n: any) => n.name === 'packages')
    expect(packages.children).toHaveLength(1)
    expect(packages.children[0].name).toBe('api')
    expect(packages.children[0].children[0].name).toBe('README.md')
  })

  it('skips build directories and hidden files', async () => {
    fs.mkdirSync(path.join(tmpDir, 'node_modules', 'lib'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'dist'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, '.next'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'coverage'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'lib', 'README.md'), '# Lib\n')
    fs.writeFileSync(path.join(tmpDir, 'dist', 'CHANGELOG.md'), '# Dist\n')
    fs.writeFileSync(path.join(tmpDir, '.next', 'BUILD.md'), '# Build\n')
    fs.writeFileSync(path.join(tmpDir, 'coverage', 'REPORT.md'), '# Report\n')
    fs.writeFileSync(path.join(tmpDir, 'docs', 'real.md'), '# Real\n')

    const projectId = createProject(getDb(), { name: 'Docs Test', path: tmpDir })
    const res = await GET(new NextRequest(`http://localhost/api/projects/${projectId}/docs`), p(projectId))
    const body = await res.json()

    expect(body.nodes.map((n: any) => n.name)).toEqual(['docs'])
  })

  it('includes .mdx files alongside .md', async () => {
    fs.writeFileSync(path.join(tmpDir, 'page.mdx'), '# MDX\n')
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), '# MD\n')

    const projectId = createProject(getDb(), { name: 'Docs Test', path: tmpDir })
    const res = await GET(new NextRequest(`http://localhost/api/projects/${projectId}/docs`), p(projectId))
    const body = await res.json()

    expect(body.nodes.map((n: any) => n.name)).toEqual(['doc.md', 'page.mdx'])
  })
})
