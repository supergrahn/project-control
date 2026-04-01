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

  if (isLoading) return <p className="text-text-muted text-sm">Loading...</p>

  return (
    <>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <Lightbulb size={18} className="text-accent-orange" /> Insights
        </h1>
        <p className="text-xs text-text-muted mt-0.5">Key decisions, patterns, and learnings extracted from sessions</p>
      </div>

      {insights.length === 0 && (
        <div className="rounded-lg border border-border-default bg-bg-primary/50 px-6 py-10 text-center">
          <Lightbulb size={28} className="text-text-faint mx-auto mb-3" />
          <p className="text-text-secondary text-sm font-medium">No insights yet</p>
          <p className="text-text-muted text-xs mt-1">Insights are automatically extracted from session debriefs.</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {insights.map(insight => {
          const tags = insight.tags ? JSON.parse(insight.tags) as string[] : []
          return (
            <div key={insight.id} className="bg-bg-primary border border-border-default rounded-lg px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${CATEGORY_COLORS[insight.category] ?? CATEGORY_COLORS.learning}`}>{insight.category}</span>
                {tags.map(tag => (
                  <span key={tag} className="text-[10px] text-text-muted">#{tag}</span>
                ))}
              </div>
              <h3 className="text-sm font-semibold text-text-primary">{insight.title}</h3>
              <p className="text-xs text-text-secondary mt-1">{insight.detail}</p>
            </div>
          )
        })}
      </div>
    </>
  )
}
