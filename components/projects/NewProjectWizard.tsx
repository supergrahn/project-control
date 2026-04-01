'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAddProject } from '@/hooks/useProjects'

type Provider = { id: string; name: string; is_active: number }

type Props = { onClose: () => void }

const STEPS = ['Project', 'Agent', 'Task', 'Launch'] as const

export function NewProjectWizard({ onClose }: Props) {
  const router = useRouter()
  const addProject = useAddProject()

  const [step, setStep] = useState(1)
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [pathError, setPathError] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)
  const [pathValid, setPathValid] = useState(false)

  // Agent step
  const [agentName, setAgentName] = useState('')
  const [agentTitle, setAgentTitle] = useState('')
  const [providerId, setProviderId] = useState('')
  const [agentModel, setAgentModel] = useState('')
  const [providers, setProviders] = useState<Provider[]>([])
  const [providersLoaded, setProvidersLoaded] = useState(false)
  const [agentSkipped, setAgentSkipped] = useState(false)

  // Task step
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDesc, setTaskDesc] = useState('')
  const [taskPriority, setTaskPriority] = useState('medium')
  const [taskSkipped, setTaskSkipped] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function validatePath(rawPath: string) {
    if (!rawPath.trim()) return
    setValidating(true)
    setPathError(null)
    setPathValid(false)
    try {
      const res = await fetch(`/api/projects/validate-path?path=${encodeURIComponent(rawPath.trim())}`)
      if (!res.ok) {
        setPathError('Could not validate path')
        return
      }
      const data = await res.json()
      if (data.valid) {
        if (!name) setName(data.name)
        setPathError(null)
        setPathValid(true)
      } else {
        setPathError(data.error ?? 'Not a git repository')
        setPathValid(false)
      }
    } catch {
      setPathError('Could not validate path')
    } finally {
      setValidating(false)
    }
  }

  async function goToAgentStep() {
    // fetch providers
    if (!providersLoaded) {
      try {
        const res = await fetch('/api/providers')
        const data = await res.json()
        setProviders(data)
      } catch {
        setProviders([])
      }
      setProvidersLoaded(true)
    }
    setStep(2)
  }

  function skipAgent() {
    setAgentSkipped(true)
    setTaskSkipped(true)
    setStep(4)
  }

  function goToTaskStep() {
    setStep(3)
  }

  function skipTask() {
    setTaskSkipped(true)
    setStep(4)
  }

  function goToLaunch() {
    setStep(4)
  }

  async function handleSubmit(startNow: boolean) {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const result = await addProject.mutateAsync({ name: name.trim(), path: path.trim() })
      const projectId = result.id

      // optionally create agent
      let createdAgentId: string | null = null
      if (!agentSkipped && agentName.trim()) {
        const agentRes = await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: agentName.trim(),
            title: agentTitle.trim() || undefined,
            project_id: projectId,
            provider_id: providerId || undefined,
            model: agentModel || undefined,
          }),
        })
        const agentData = await agentRes.json()
        createdAgentId = agentData.id
      }

      // optionally create task
      let createdTaskId: string | null = null
      if (!taskSkipped && taskTitle.trim()) {
        const taskRes = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: taskTitle.trim(),
            description: taskDesc.trim() || undefined,
            priority: taskPriority,
            project_id: projectId,
            status: 'idea',
          }),
        })
        const taskData = await taskRes.json()
        createdTaskId = taskData.id
      }

      // optionally start session
      if (startNow && createdAgentId && createdTaskId) {
        await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, phase: 'develop' }),
        })
      }

      router.push(`/projects/${projectId}`)
    } catch {
      setSubmitError('Failed to create project. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }


  // Step indicator
  const stepIndicator = (
    <div className="flex gap-0 mb-6 border-b border-border-default pb-4">
      {STEPS.map((label, idx) => {
        const stepNum = idx + 1
        const isActive = step === stepNum
        const isDone = step > stepNum
        return (
          <div key={label} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                isActive ? 'bg-accent-blue text-white' : isDone ? 'bg-status-success text-white' : 'bg-border-default text-text-muted'
              }`}>{stepNum}</div>
              <span className={`text-[10px] mt-1 ${
                isActive ? 'text-accent-blue' : isDone ? 'text-status-success' : 'text-text-muted'
              }`}>{label}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className="h-px bg-border-default flex-[0.3] mb-4" />
            )}
          </div>
        )
      })}
    </div>
  )

  // Step 1: Project
  if (step === 1) {
    const canNext = pathValid && !validating && !pathError && name.trim().length > 0
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000]" onClick={onClose}>
        <div className="bg-bg-secondary border border-border-default rounded-[10px] p-7 w-[480px] font-system" onClick={e => e.stopPropagation()}>
          {stepIndicator}
          <div className="text-text-primary font-bold text-base mb-5">New Project</div>
          <div className="mb-4">
            <label className="text-text-secondary text-[11px] mb-1.5 block">Git repo path</label>
            <input
              className={`w-full bg-bg-primary border rounded-[6px] text-text-primary text-[13px] px-2.5 py-2 outline-none ${pathError ? 'border-red-500' : 'border-border-default'}`}
              placeholder="/absolute/path/to/repo"
              value={path}
              onChange={e => { setPath(e.target.value); setPathError(null); setPathValid(false) }}
              onBlur={e => validatePath(e.target.value)}
              autoFocus
            />
            {validating && <div className="text-text-muted text-[11px] mt-1">Checking…</div>}
            {pathError && <div className="text-red-500 text-[11px] mt-1">{pathError}</div>}
          </div>
          <div className="mb-4">
            <label className="text-text-secondary text-[11px] mb-1.5 block">Project name</label>
            <input
              className="w-full bg-bg-primary border border-border-default rounded-[6px] text-text-primary text-[13px] px-2.5 py-2 outline-none"
              placeholder="Project name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button type="button" onClick={onClose} className="bg-none border border-border-default text-text-secondary rounded-[6px] px-3.5 py-1.75 cursor-pointer text-[13px]">Cancel</button>
            <button
              type="button"
              onClick={goToAgentStep}
              disabled={!canNext}
              className={`rounded-[6px] px-3.5 py-1.75 cursor-pointer text-[13px] font-semibold border-none ${
                canNext
                  ? 'bg-accent-blue text-text-primary'
                  : 'bg-border-default text-text-muted cursor-not-allowed'
              }`}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Step 2: Agent
  if (step === 2) {
    const hasProviders = providers.length > 0
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000]" onClick={onClose}>
        <div className="bg-bg-secondary border border-border-default rounded-[10px] p-7 w-[480px] font-system" onClick={e => e.stopPropagation()}>
          {stepIndicator}
          <div className="text-text-primary font-bold text-base mb-5">Configure Agent</div>
          {!hasProviders ? (
            <div className="text-text-secondary text-[13px] mb-4 p-3 bg-bg-primary rounded-[6px] border border-border-default">
              No providers configured. Go to Settings to add an AI provider first, or skip this step.
            </div>
          ) : (
            <>
              <div className="mb-4">
                <label className="text-text-secondary text-[11px] mb-1.5 block">Agent name</label>
                <input
                  className="w-full bg-bg-primary border border-border-default rounded-[6px] text-text-primary text-[13px] px-2.5 py-2 outline-none"
                  placeholder="Agent name"
                  value={agentName}
                  onChange={e => setAgentName(e.target.value)}
                />
              </div>
              <div className="mb-4">
                <label className="text-text-secondary text-[11px] mb-1.5 block">Provider</label>
                <select
                  className="w-full bg-bg-primary border border-border-default rounded-[6px] text-text-primary text-[13px] px-2.5 py-2 outline-none cursor-pointer"
                  value={providerId}
                  onChange={e => setProviderId(e.target.value)}
                >
                  <option value="">Select provider…</option>
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="mb-4">
                <label className="text-text-secondary text-[11px] mb-1.5 block">Model (optional)</label>
                <input
                  className="w-full bg-bg-primary border border-border-default rounded-[6px] text-text-primary text-[13px] px-2.5 py-2 outline-none"
                  placeholder="e.g. claude-opus-4"
                  value={agentModel}
                  onChange={e => setAgentModel(e.target.value)}
                />
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 mt-6">
            <button type="button" onClick={skipAgent} className="bg-none border border-border-default text-text-secondary rounded-[6px] px-3.5 py-1.75 cursor-pointer text-[13px]">Set up later</button>
            {hasProviders && (
              <button
                type="button"
                onClick={goToTaskStep}
                disabled={!agentName.trim()}
                className={`rounded-[6px] px-3.5 py-1.75 cursor-pointer text-[13px] font-semibold border-none ${
                  agentName.trim()
                    ? 'bg-accent-blue text-text-primary'
                    : 'bg-border-default text-text-muted cursor-not-allowed'
                }`}
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Step 3: Task
  if (step === 3) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000]" onClick={onClose}>
        <div className="bg-bg-secondary border border-border-default rounded-[10px] p-7 w-[480px] font-system" onClick={e => e.stopPropagation()}>
          {stepIndicator}
          <div className="text-text-primary font-bold text-base mb-5">Add First Task</div>
          <div className="mb-4">
            <label className="text-text-secondary text-[11px] mb-1.5 block">Task title</label>
            <input
              className="w-full bg-bg-primary border border-border-default rounded-[6px] text-text-primary text-[13px] px-2.5 py-2 outline-none"
              placeholder="Task title"
              value={taskTitle}
              onChange={e => setTaskTitle(e.target.value)}
            />
          </div>
          <div className="mb-4">
            <label className="text-text-secondary text-[11px] mb-1.5 block">Description (optional)</label>
            <textarea
              className="w-full bg-bg-primary border border-border-default rounded-[6px] text-text-primary text-[13px] px-2.5 py-2 outline-none min-h-[72px] resize-vertical"
              placeholder="Describe the task…"
              value={taskDesc}
              onChange={e => setTaskDesc(e.target.value)}
            />
          </div>
          <div className="mb-4">
            <label className="text-text-secondary text-[11px] mb-1.5 block">Priority</label>
            <select
              className="w-full bg-bg-primary border border-border-default rounded-[6px] text-text-primary text-[13px] px-2.5 py-2 outline-none cursor-pointer"
              value={taskPriority}
              onChange={e => setTaskPriority(e.target.value)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button type="button" onClick={skipTask} className="bg-none border border-border-default text-text-secondary rounded-[6px] px-3.5 py-1.75 cursor-pointer text-[13px]">Add tasks later</button>
            <button
              type="button"
              onClick={goToLaunch}
              disabled={!taskTitle.trim()}
              className={`rounded-[6px] px-3.5 py-1.75 cursor-pointer text-[13px] font-semibold border-none ${
                taskTitle.trim()
                  ? 'bg-accent-blue text-text-primary'
                  : 'bg-border-default text-text-muted cursor-not-allowed'
              }`}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Step 4: Launch
  const canStartNow = !agentSkipped && !taskSkipped
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000]" onClick={onClose}>
      <div className="bg-bg-secondary border border-border-default rounded-[10px] p-7 w-[480px] font-system" onClick={e => e.stopPropagation()}>
        {stepIndicator}
        <div className="text-text-primary font-bold text-base mb-3">Ready to Launch</div>
        <div className="text-text-secondary text-[13px] mb-5">
          Your project <strong className="text-text-primary">{name}</strong> is configured and ready to create.
        </div>
        {submitError && <div className="text-red-500 text-[11px] mb-3">{submitError}</div>}
        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className="bg-none border border-border-default text-text-secondary rounded-[6px] px-3.5 py-1.75 cursor-pointer text-[13px]">Cancel</button>
          {canStartNow && (
            <button
              type="button"
              onClick={() => handleSubmit(true)}
              disabled={submitting}
              className={`rounded-[6px] px-3.5 py-1.75 cursor-pointer text-[13px] font-semibold border-none ${
                submitting ? 'bg-border-default text-text-muted cursor-not-allowed' : 'bg-status-success text-text-primary'
              }`}
            >
              {submitting ? 'Creating…' : 'Start now'}
            </button>
          )}
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            disabled={submitting}
            className={`rounded-[6px] px-3.5 py-1.75 cursor-pointer text-[13px] font-semibold border-none ${
              submitting ? 'bg-border-default text-text-muted cursor-not-allowed' : 'bg-accent-blue text-text-primary'
            }`}
          >
            {submitting ? 'Creating…' : 'Create & Open'}
          </button>
        </div>
      </div>
    </div>
  )
}
