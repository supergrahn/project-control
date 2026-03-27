import fs from 'fs'
import path from 'path'
import type { Project } from './db'

type ProjectAudit = {
  projectId: string
  projectName: string
  packageCount: number
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

type DriftEntry = {
  package: string
  versions: Array<{ projectName: string; version: string }>
}

export type TechAuditReport = {
  projects: ProjectAudit[]
  drift: DriftEntry[]
  scannedAt: string
}

export function scanTechStack(projects: Project[]): TechAuditReport {
  const audits: ProjectAudit[] = []
  const packageVersions = new Map<string, Array<{ projectName: string; version: string }>>()

  for (const project of projects) {
    const pkgPath = path.join(project.path, 'package.json')
    if (!fs.existsSync(pkgPath)) continue

    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      const deps = pkg.dependencies ?? {}
      const devDeps = pkg.devDependencies ?? {}

      audits.push({
        projectId: project.id,
        projectName: project.name,
        packageCount: Object.keys(deps).length + Object.keys(devDeps).length,
        dependencies: deps,
        devDependencies: devDeps,
      })

      // Track versions for drift detection
      for (const [name, version] of [...Object.entries(deps), ...Object.entries(devDeps)]) {
        if (!packageVersions.has(name)) packageVersions.set(name, [])
        packageVersions.get(name)!.push({ projectName: project.name, version: version as string })
      }
    } catch {
      // skip unreadable package.json
    }
  }

  // Find drift: packages with >1 distinct version across projects
  const drift: DriftEntry[] = []
  for (const [pkg, versions] of packageVersions) {
    const uniqueVersions = new Set(versions.map(v => v.version))
    if (uniqueVersions.size > 1 && versions.length >= 2) {
      drift.push({ package: pkg, versions })
    }
  }
  drift.sort((a, b) => b.versions.length - a.versions.length)

  return { projects: audits, drift, scannedAt: new Date().toISOString() }
}
