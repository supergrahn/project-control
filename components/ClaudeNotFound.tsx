export function ClaudeNotFound() {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
      <strong>Claude Code not found.</strong> Install it from{' '}
      <a href="https://claude.ai/code" className="underline" target="_blank" rel="noreferrer">
        claude.ai/code
      </a>{' '}
      and restart the dashboard.
    </div>
  )
}
