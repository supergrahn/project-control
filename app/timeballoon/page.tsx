// Read-only mobile dashboard for TimeBalloon. Mounted at /timeballoon on
// project-control. Designed to be opened from a phone/iPad over Tailscale
// for a glance at today's plan.
//
// Auth: deliberately none here — on Tailscale the network boundary is the
// access control. If/when project-control goes public TLS, wrap this route
// in middleware that checks TIMEBALLOON_SYNC_TOKEN (same env var the API
// uses). Marked deliberately so it surfaces in any audit.
//
// Implementation: server component reads the timeballoon_* mirror tables
// directly via getDb(). No client-side fetches, no auth tokens in the
// browser. Re-fetched on each navigation; the user pulls down to refresh
// because the data IS the source of truth for this view.

import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'  // always re-read on visit
export const revalidate = 0

type TimesheetRow = {
  uuid: string
  date: string
  project: string
  work_type: string
  total_seconds: number
  description: string
  status: string
  task_ref: string | null
}

type WeekTotal = { project: string; total_seconds: number; days_active: number }

type PmTask = {
  source: string
  source_id: string
  title: string
  status: string
  project_name: string
  url: string
}

function todayLocalIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function thisWeekRange(): { start: string; end: string } {
  const now = new Date()
  const dow = now.getDay()
  const monOffset = dow === 0 ? -6 : 1 - dow
  const mon = new Date(now); mon.setDate(now.getDate() + monOffset)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: iso(mon), end: iso(sun) }
}

function hours(secs: number): string {
  return (Math.round(secs / 3600 * 100) / 100).toFixed(2)
}

function loadData() {
  const db = getDb()
  const today = todayLocalIso()
  const week = thisWeekRange()

  const todayRows = db.prepare(`
    SELECT uuid, date, project, work_type, total_seconds, description, status, task_ref
    FROM timeballoon_daily_timesheet
    WHERE date = ? AND is_deleted = 0
    ORDER BY total_seconds DESC
  `).all(today) as TimesheetRow[]

  const weekTotals = db.prepare(`
    SELECT project,
           SUM(total_seconds) AS total_seconds,
           COUNT(DISTINCT date) AS days_active
    FROM timeballoon_daily_timesheet
    WHERE date >= ? AND date <= ? AND is_deleted = 0
    GROUP BY project
    ORDER BY total_seconds DESC
  `).all(week.start, week.end) as WeekTotal[]

  // PM tasks live in project-control's own pm-task-source state — the same
  // /api/external-tasks endpoint the Mac polls. For the mobile glance, the
  // ergonomically simplest path is to skip the adapter chain (which needs
  // tokens + network) and just show what's already cached in the mirror.
  // But we don't mirror pm_tasks (canonical lives upstream). So for v1, the
  // mobile view only shows the user's own timesheet — PM tasks visible on
  // the Mac stay there. Future enhancement: a small pm_tasks mirror.
  const pmTasks: PmTask[] = []

  return { todayRows, weekTotals, pmTasks, today, week }
}

export default function TimeBalloonMobilePage() {
  let data: ReturnType<typeof loadData>
  try {
    data = loadData()
  } catch (e) {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-6 font-sans">
        <h1 className="text-2xl font-black mb-4">TimeBalloon</h1>
        <p className="text-sm text-rose-300">
          Could not read sync database. Make sure project-control has been started
          at least once so migrations run.
        </p>
        <pre className="text-xs text-gray-500 mt-2 overflow-auto">{String(e)}</pre>
      </div>
    )
  }
  const { todayRows, weekTotals, today, week } = data

  const todayTotalSecs = todayRows.reduce((acc, r) => acc + r.total_seconds, 0)
  const weekTotalSecs = weekTotals.reduce((acc, r) => acc + r.total_seconds, 0)

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white font-sans">
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <header className="mb-6">
          <div className="flex items-baseline justify-between">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight italic">TimeBalloon</h1>
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              read-only · mobile
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Mirror of your Mac. Edits happen in the desktop app.
          </p>
        </header>

        {/* Today */}
        <section className="mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-black tracking-tight">Today</h2>
            <span className="text-sm font-mono text-blue-300">{hours(todayTotalSecs)}h</span>
          </div>
          <div className="text-[10px] text-gray-600 mb-3 font-mono">{today}</div>
          {todayRows.length === 0 ? (
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-sm text-gray-500">
              No timesheet rows for today yet. The Mac will fill these in as it captures activity.
            </div>
          ) : (
            <div className="space-y-2">
              {todayRows.map(r => (
                <div key={r.uuid} className="p-3 rounded-2xl bg-white/5 border border-white/5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-white">{r.project}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">{r.work_type}{r.task_ref ? ` · ${r.task_ref}` : ''}</div>
                      <div className="text-xs text-gray-400 mt-1 leading-snug">{r.description || <em className="text-gray-700">(no description)</em>}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-mono font-bold text-blue-300">{hours(r.total_seconds)}h</div>
                      <div className={`text-[9px] font-black uppercase tracking-widest mt-0.5 ${
                        r.status === 'finalized' ? 'text-emerald-400' :
                        r.status === 'manual' ? 'text-amber-400' : 'text-gray-500'
                      }`}>
                        {r.status}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* This week */}
        <section className="mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-black tracking-tight">This week</h2>
            <span className="text-sm font-mono text-blue-300">{hours(weekTotalSecs)}h</span>
          </div>
          <div className="text-[10px] text-gray-600 mb-3 font-mono">{week.start} → {week.end}</div>
          {weekTotals.length === 0 ? (
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-sm text-gray-500">
              No timesheet rows this week yet.
            </div>
          ) : (
            <div className="space-y-2">
              {weekTotals.map(w => {
                const pct = weekTotalSecs > 0 ? (w.total_seconds / weekTotalSecs) * 100 : 0
                return (
                  <div key={w.project} className="p-3 rounded-2xl bg-white/5 border border-white/5">
                    <div className="flex items-baseline justify-between mb-2">
                      <div className="text-sm font-bold text-white">{w.project}</div>
                      <div className="text-right">
                        <span className="text-sm font-mono text-blue-300">{hours(w.total_seconds)}h</span>
                        <span className="text-[10px] text-gray-600 ml-2">{w.days_active} day{w.days_active === 1 ? '' : 's'}</span>
                      </div>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <footer className="mt-8 text-center">
          <p className="text-[10px] text-gray-600 uppercase tracking-widest font-black">
            pull to refresh
          </p>
        </footer>
      </div>
    </div>
  )
}
