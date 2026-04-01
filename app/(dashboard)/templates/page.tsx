'use client'
import { useState } from 'react'
import { FileStack, Plus, Trash2, X } from 'lucide-react'
import { useTemplates, useCreateTemplate, useDeleteTemplate } from '@/hooks/useTemplates'

export default function TemplatesPage() {
  const { data: templates = [], isLoading } = useTemplates()
  const create = useCreateTemplate()
  const remove = useDeleteTemplate()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [ideasDir, setIdeasDir] = useState('docs/ideas')
  const [specsDir, setSpecsDir] = useState('docs/specs')
  const [plansDir, setPlansDir] = useState('docs/plans')

  if (isLoading) return <p className="text-text-muted text-sm">Loading...</p>

  const handleCreate = async () => {
    if (!name.trim()) return
    await create.mutateAsync({
      name,
      description: description || undefined,
      dirs: { ideas_dir: ideasDir, specs_dir: specsDir, plans_dir: plansDir },
    })
    setName(''); setDescription(''); setShowForm(false)
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <FileStack size={18} className="text-accent-blue" /> Project Templates
          </h1>
          <p className="text-xs text-text-muted mt-0.5">Reusable project configurations</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent-blue/70 hover:bg-accent-blue text-white rounded">
          <Plus size={14} /> New Template
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-border-default bg-bg-primary p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">New Template</h3>
            <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-primary"><X size={14} /></button>
          </div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Template name" className="w-full bg-bg-base border border-border-default rounded px-3 py-2 text-sm text-text-primary outline-none mb-2" />
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" className="w-full bg-bg-base border border-border-default rounded px-3 py-2 text-sm text-text-secondary outline-none mb-3" />
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div>
              <label className="text-[10px] text-text-muted mb-1 block">Ideas dir</label>
              <input value={ideasDir} onChange={e => setIdeasDir(e.target.value)} className="w-full bg-bg-base border border-border-default rounded px-2 py-1.5 text-xs text-text-secondary outline-none font-mono" />
            </div>
            <div>
              <label className="text-[10px] text-text-muted mb-1 block">Specs dir</label>
              <input value={specsDir} onChange={e => setSpecsDir(e.target.value)} className="w-full bg-bg-base border border-border-default rounded px-2 py-1.5 text-xs text-text-secondary outline-none font-mono" />
            </div>
            <div>
              <label className="text-[10px] text-text-muted mb-1 block">Plans dir</label>
              <input value={plansDir} onChange={e => setPlansDir(e.target.value)} className="w-full bg-bg-base border border-border-default rounded px-2 py-1.5 text-xs text-text-secondary outline-none font-mono" />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={handleCreate} disabled={!name.trim()} className="px-4 py-1.5 text-sm bg-accent-blue/70 hover:bg-accent-blue text-white rounded disabled:opacity-50">Save Template</button>
          </div>
        </div>
      )}

      {templates.length === 0 && !showForm && (
        <div className="rounded-lg border border-border-default bg-bg-primary/50 px-6 py-10 text-center">
          <FileStack size={28} className="text-text-faint mx-auto mb-3" />
          <p className="text-text-secondary text-sm font-medium">No templates yet</p>
          <p className="text-text-muted text-xs mt-1">Save project configurations as templates for quick setup.</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {templates.map(t => {
          const dirs = JSON.parse(t.dirs)
          return (
            <div key={t.id} className="bg-bg-primary border border-border-default rounded-lg px-4 py-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">{t.name}</h3>
                {t.description && <p className="text-xs text-text-muted mt-0.5">{t.description}</p>}
                <div className="flex gap-3 mt-1">
                  {dirs.ideas_dir && <span className="text-[10px] text-text-muted font-mono">{dirs.ideas_dir}</span>}
                  {dirs.specs_dir && <span className="text-[10px] text-text-muted font-mono">{dirs.specs_dir}</span>}
                  {dirs.plans_dir && <span className="text-[10px] text-text-muted font-mono">{dirs.plans_dir}</span>}
                </div>
              </div>
              <button onClick={() => remove.mutate(t.id)} className="text-text-muted hover:text-accent-red p-1"><Trash2 size={14} /></button>
            </div>
          )
        })}
      </div>
    </>
  )
}
