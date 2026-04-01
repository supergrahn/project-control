'use client'
import { useState } from 'react'
import { X, Check } from 'lucide-react'
import { useSaveDailyPlan } from '@/hooks/useDailyPlan'
import type { DashboardResponse } from '@/lib/dashboard'

type Props = {
  isOpen: boolean
  onClose: () => void
  upNext: DashboardResponse['upNext']
}

export function DailyPlanModal({ isOpen, onClose, upNext }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const savePlan = useSaveDailyPlan()

  if (!isOpen) return null

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else if (next.size < 5) next.add(key)
      return next
    })
  }

  const handleSave = async () => {
    const items = upNext
      .filter(i => selected.has(`${i.projectId}-${i.featureName}`))
      .map(i => ({ projectId: i.projectId, projectName: i.projectName, featureName: i.featureName, filePath: i.filePath, stage: i.stage }))
    await savePlan.mutateAsync(items)
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-bg-overlay" onClick={onClose} />
      <div className="fixed top-[10%] left-1/2 -translate-x-1/2 z-50 w-full max-w-md bg-bg-primary border border-border-strong rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-default">
          <h2 className="text-sm font-semibold text-text-primary">Plan Your Day</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={14} /></button>
        </div>
        <div className="px-5 py-3">
          <p className="text-xs text-text-muted mb-3">Pick 3-5 items to focus on today ({selected.size}/5 selected)</p>
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {upNext.map(item => {
              const key = `${item.projectId}-${item.featureName}`
              const isSelected = selected.has(key)
              return (
                <div key={key} onClick={() => toggle(key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-colors ${
                    isSelected ? 'bg-accent-blue/10 border border-accent-blue/30' : 'hover:bg-bg-secondary'
                  }`}>
                  <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                    isSelected ? 'bg-accent-blue border-accent-blue text-white' : 'border-text-faint'
                  }`}>
                    {isSelected && <Check size={10} />}
                  </span>
                  <span className="text-xs text-text-primary flex-1">{item.featureName}</span>
                  <span className="text-[10px] text-text-muted">{item.projectName}</span>
                </div>
              )
            })}
          </div>
        </div>
        <div className="flex justify-end px-5 py-3 border-t border-border-default">
          <button onClick={handleSave} disabled={selected.size === 0}
            className="px-4 py-1.5 text-sm bg-accent-blue hover:bg-accent-blue text-white rounded disabled:opacity-50">
            Set Focus ({selected.size})
          </button>
        </div>
      </div>
    </>
  )
}
