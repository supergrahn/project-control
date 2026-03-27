'use client'
import { useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { useUsage } from '@/hooks/useUsage'

export default function UsagePage() {
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const { data, isLoading } = useUsage(period)

  if (isLoading) return <p className="text-zinc-500 text-sm">Loading usage data...</p>
  if (!data) return <p className="text-zinc-500 text-sm">Failed to load usage data.</p>

  const maxDuration = Math.max(1, ...data.byProject.map(p => p.duration))

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <BarChart3 size={18} className="text-violet-400" /> Usage
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">{data.totalSessions} sessions · {Math.round(data.totalDuration / 60)}h {data.totalDuration % 60}m total</p>
        </div>
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
          {(['week', 'month'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs rounded ${period === p ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
              {p === 'week' ? '7 days' : '30 days'}
            </button>
          ))}
        </div>
      </div>

      {/* By project */}
      <div className="rounded-lg border border-zinc-800 p-4 mb-4">
        <h2 className="text-sm font-semibold text-zinc-200 mb-3">By Project</h2>
        <div className="flex flex-col gap-2">
          {data.byProject.map(p => (
            <div key={p.projectName} className="flex items-center gap-3">
              <span className="text-xs text-zinc-400 w-32 truncate">{p.projectName}</span>
              <div className="flex-1 h-4 bg-zinc-800 rounded overflow-hidden">
                <div className="h-full bg-violet-600 rounded" style={{ width: `${(p.duration / maxDuration) * 100}%` }} />
              </div>
              <span className="text-xs text-zinc-500 w-20 text-right">{p.sessions}s · {Math.round(p.duration)}m</span>
            </div>
          ))}
          {data.byProject.length === 0 && <p className="text-xs text-zinc-600">No sessions this period.</p>}
        </div>
      </div>

      {/* By phase */}
      <div className="rounded-lg border border-zinc-800 p-4 mb-4">
        <h2 className="text-sm font-semibold text-zinc-200 mb-3">By Phase</h2>
        <div className="flex gap-4">
          {data.byPhase.map(p => (
            <div key={p.phase} className="text-center">
              <div className="text-lg font-bold text-zinc-100">{p.sessions}</div>
              <div className="text-[10px] text-zinc-500">{p.phase}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Daily breakdown */}
      <div className="rounded-lg border border-zinc-800 p-4">
        <h2 className="text-sm font-semibold text-zinc-200 mb-3">Daily</h2>
        <div className="grid grid-cols-7 gap-1">
          {data.dailyBreakdown.map(d => (
            <div key={d.date} className="text-center">
              <div className={`w-full h-8 rounded ${d.sessions > 0 ? 'bg-violet-600/30' : 'bg-zinc-800'} flex items-center justify-center`}>
                <span className="text-[10px] text-zinc-300">{d.sessions}</span>
              </div>
              <span className="text-[9px] text-zinc-600">{d.date.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
