export function ClaudeNotFound() {
  return (
    <div className="rounded-lg border border-accent-orange/30 bg-accent-orange/10 px-4 py-3 text-sm text-accent-orange">
      <strong>No AI providers found.</strong> Install at least one CLI provider
      (claude, gemini, or codex) and restart the dashboard, or add one manually in Settings.
    </div>
  )
}
