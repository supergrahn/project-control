const FM_REGEX = /^---\n([\s\S]*?)\n---\n?/

export type FrontmatterData = Record<string, string | null | undefined>

export function parseFrontmatter(content: string): FrontmatterData {
  const match = content.match(FM_REGEX)
  if (!match) return {}
  const result: FrontmatterData = {}
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    const raw = line.slice(colon + 1).trim()
    result[key] = raw === 'null' ? null : raw
  }
  return result
}

export function writeFrontmatter(content: string, updates: FrontmatterData): string {
  const existing = parseFrontmatter(content)
  const merged = { ...existing, ...updates }
  const body = content.replace(FM_REGEX, '')
  const fmLines = Object.entries(merged)
    .map(([k, v]) => `${k}: ${v === null ? 'null' : v}`)
    .join('\n')
  return `---\n${fmLines}\n---\n\n${body.replace(/^\n+/, '')}`
}
