'use client'
import { Lightbulb } from 'lucide-react'
import { useInsights } from '@/hooks/useInsights'

const CATEGORY_COLORS: Record<string, string> = {
  decision: 'bg-violet-500/20 text-violet-300',
  pattern: 'bg-blue-500/20 text-blue-300',
  warning: 'bg-amber-500/20 text-amber-300',
  learning: 'bg-green-500/20 text-green-300',
}

export default function InsightsPage() {
  const { data, isLoading } = useInsights()
  const insights = data?.insights ?? []

  if (isLoading) return <p className="text-zinc-500 text-sm">Loading...</p>

  return (
    <>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
          <Lightbulb size={18} className="text-amber-400" /> Insights
        </h1>
        <p className="text-xs text-zinc-500 mt-0.5">Key decisions, patterns, and learnings extracted from sessions</p>
      </div>

      {insights.length === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center">
          <Lightbulb size={28} className="text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm font-medium">No insights yet</p>
          <p className="text-zinc-600 text-xs mt-1">Insights are automatically extracted from session debriefs.</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {insights.map(insight => {
          const tags = insight.tags ? JSON.parse(insight.tags) as string[] : []
          return (
            <div key={insight.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${CATEGORY_COLORS[insight.category] ?? CATEGORY_COLORS.learning}`}>{insight.category}</span>
                {tags.map(tag => (
                  <span key={tag} className="text-[10px] text-zinc-600">#{tag}</span>
                ))}
              </div>
              <h3 className="text-sm font-semibold text-zinc-200">{insight.title}</h3>
              <p className="text-xs text-zinc-400 mt-1">{insight.detail}</p>
            </div>
          )
        })}
      </div>
    </>
  )
}
