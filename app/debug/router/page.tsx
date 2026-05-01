import { notFound } from 'next/navigation'
import { getDb } from '@/lib/db'
import { listScores } from '@/lib/router'

// Always render fresh from the DB — never cache. Without this, Next.js may
// attempt to statically render at build time, calling getDb() in an
// environment where the DB doesn't exist.
export const dynamic = 'force-dynamic'

// Server-side render reads the DB directly via listScores — no fetch hop to
// the /api/router/scores endpoint, since we're already on the server. The API
// remains for future client-side consumers. The page is gated behind
// ENABLE_DEBUG_PAGES so a stray hit in production resolves to a 404 rather
// than exposing routing internals.
export default async function DebugRouterPage() {
  if (process.env.ENABLE_DEBUG_PAGES !== '1') notFound()

  const scores = listScores(getDb())

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-text-primary mb-4">Router scores</h1>
      {scores.length === 0 ? (
        <div className="text-text-muted text-sm">
          No observations yet — defaults are still in effect for every cell.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-text-muted text-xs">
            <tr>
              <th className="text-left p-2">Phase</th>
              <th className="text-left p-2">Complexity</th>
              <th className="text-left p-2">Provider</th>
              <th className="text-right p-2">n</th>
              <th className="text-right p-2">success rate</th>
              <th className="text-left p-2">updated</th>
            </tr>
          </thead>
          <tbody>
            {scores.map((r) => (
              <tr
                key={`${r.phase}-${r.complexity}-${r.provider_id}`}
                className="border-t border-border-default"
              >
                <td className="p-2 text-text-primary">{r.phase}</td>
                <td className="p-2 text-text-primary">{r.complexity}</td>
                <td className="p-2 text-text-primary">{r.provider_id}</td>
                <td className="p-2 text-right text-text-primary">{r.n_outcomes}</td>
                <td className="p-2 text-right text-text-primary">
                  {(r.success_rate * 100).toFixed(1)}%
                </td>
                <td className="p-2 text-text-muted text-xs">{r.updated_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form action="/api/router/reset-learning" method="POST" className="mt-6">
        <button
          type="submit"
          className="text-sm text-accent-red border border-accent-red rounded px-3 py-1"
        >
          Reset router learning
        </button>
      </form>
    </div>
  )
}
