export function ClaudeNotFound() {
  return (
    <div className="rounded-lg border border-accent-orange/30 bg-accent-orange/10 px-4 py-3 text-sm text-accent-orange">
      <strong>Claude Code not found.</strong> Install it from{' '}
      <a href="https://claude.ai/code" className="underline" target="_blank" rel="noreferrer">
        claude.ai/code
      </a>{' '}
      and restart the dashboard.
    </div>
  )
}
