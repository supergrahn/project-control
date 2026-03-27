'use client'
import { Layout } from 'lucide-react'
import { useDashboard } from '@/hooks/useDashboard'
import { useKanban, type KanbanCard } from '@/hooks/useKanban'

const AUDIT_ICONS: Record<string, string> = {
  blockers: '\u{1F534}',
  warnings: '\u{1F7E1}',
  clean: '\u{1F7E2}',
}

function Column({ title, cards, color }: { title: string; cards: KanbanCard[]; color: string }) {
  return (
    <div className="flex-1 min-w-[200px]">
      <div className={`flex items-center gap-2 mb-3 px-1`}>
        <span className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{title}</span>
        <span className="text-[10px] text-zinc-600">{cards.length}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {cards.map((card, i) => (
          <div key={`${card.projectId}-${card.featureName}-${i}`}
            className={`bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 ${card.stale ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-200 truncate">{card.featureName}</span>
              {card.auditStatus && <span className="text-xs ml-1">{AUDIT_ICONS[card.auditStatus]}</span>}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-zinc-500">{card.projectName}</span>
              {card.stale && <span className="text-[10px] text-zinc-600">{'\u23F8'} stale</span>}
            </div>
          </div>
        ))}
        {cards.length === 0 && (
          <div className="text-[10px] text-zinc-700 text-center py-4 border border-dashed border-zinc-800 rounded-lg">Empty</div>
        )}
      </div>
    </div>
  )
}

export default function KanbanPage() {
  const { data, isLoading } = useDashboard()
  const columns = useKanban(data)

  if (isLoading) return <p className="text-zinc-500 text-sm">Loading...</p>

  const total = columns.ideas.length + columns.specs.length + columns.plans.length + columns.inProgress.length

  return (
    <>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
          <Layout size={18} className="text-violet-400" /> Pipeline Board
        </h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          {total} features across all projects
        </p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        <Column title="Ideas" cards={columns.ideas} color="bg-blue-400" />
        <Column title="Specs" cards={columns.specs} color="bg-violet-400" />
        <Column title="Plans" cards={columns.plans} color="bg-green-400" />
        <Column title="In Progress" cards={columns.inProgress} color="bg-amber-400" />
      </div>
    </>
  )
}
