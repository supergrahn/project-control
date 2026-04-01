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

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  }
  const modal: React.CSSProperties = {
    background: '#141618', border: '1px solid #1e2124', borderRadius: 10,
    padding: 28, width: 480, fontFamily: 'system-ui, sans-serif',
  }
  const labelStyle: React.CSSProperties = { color: '#8a9199', fontSize: 11, marginBottom: 6, display: 'block' }
  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#0d0e10', border: '1px solid #1e2124', borderRadius: 6,
    color: '#e2e6ea', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box', outline: 'none',
  }
  const btnRow: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }
  const cancelBtn: React.CSSProperties = {
    background: 'none', border: '1px solid #1e2124', color: '#8a9199',
    borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13,
  }
  const primaryBtn: React.CSSProperties = {
    background: '#5b9bd5', border: 'none', color: '#e2e6ea',
    borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  }
  const disabledBtn: React.CSSProperties = {
    ...primaryBtn, background: '#1c1f22', cursor: 'not-allowed',
  }

  // Step indicator
  const stepIndicator = (
    <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid #1e2124', paddingBottom: 16 }}>
      {STEPS.map((label, idx) => {
        const stepNum = idx + 1
        const isActive = step === stepNum
        const isDone = step > stepNum
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 11, fontWeight: 700,
                background: isActive ? '#5b9bd5' : isDone ? '#3a8c5c' : '#1e2124',
                color: isActive || isDone ? '#fff' : '#454c54',
              }}>{stepNum}</div>
              <span style={{
                fontSize: 10, marginTop: 4,
                color: isActive ? '#5b9bd5' : isDone ? '#3a8c5c' : '#454c54',
              }}>{label}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <div style={{ height: 1, background: '#1e2124', flex: 0.3, marginBottom: 16 }} />
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
      <div style={overlay} onClick={onClose}>
        <div style={modal} onClick={e => e.stopPropagation()}>
          {stepIndicator}
          <div style={{ color: '#e2e6ea', fontWeight: 700, fontSize: 16, marginBottom: 20 }}>New Project</div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Git repo path</label>
            <input
              style={{ ...inputStyle, borderColor: pathError ? '#c04040' : '#1e2124' }}
              placeholder="/absolute/path/to/repo"
              value={path}
              onChange={e => { setPath(e.target.value); setPathError(null); setPathValid(false) }}
              onBlur={e => validatePath(e.target.value)}
              autoFocus
            />
            {validating && <div style={{ color: '#5a6370', fontSize: 11, marginTop: 4 }}>Checking…</div>}
            {pathError && <div style={{ color: '#c04040', fontSize: 11, marginTop: 4 }}>{pathError}</div>}
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Project name</label>
            <input
              style={inputStyle}
              placeholder="Project name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div style={btnRow}>
            <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
            <button
              type="button"
              onClick={goToAgentStep}
              disabled={!canNext}
              style={canNext ? primaryBtn : disabledBtn}
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
      <div style={overlay} onClick={onClose}>
        <div style={modal} onClick={e => e.stopPropagation()}>
          {stepIndicator}
          <div style={{ color: '#e2e6ea', fontWeight: 700, fontSize: 16, marginBottom: 20 }}>Configure Agent</div>
          {!hasProviders ? (
            <div style={{ color: '#8a9199', fontSize: 13, marginBottom: 16, padding: '12px', background: '#0d0e10', borderRadius: 6, border: '1px solid #1e2124' }}>
              No providers configured. Go to Settings to add an AI provider first, or skip this step.
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Agent name</label>
                <input
                  style={inputStyle}
                  placeholder="Agent name"
                  value={agentName}
                  onChange={e => setAgentName(e.target.value)}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Provider</label>
                <select
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  value={providerId}
                  onChange={e => setProviderId(e.target.value)}
                >
                  <option value="">Select provider…</option>
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Model (optional)</label>
                <input
                  style={inputStyle}
                  placeholder="e.g. claude-opus-4"
                  value={agentModel}
                  onChange={e => setAgentModel(e.target.value)}
                />
              </div>
            </>
          )}
          <div style={btnRow}>
            <button type="button" onClick={skipAgent} style={cancelBtn}>Set up later</button>
            {hasProviders && (
              <button
                type="button"
                onClick={goToTaskStep}
                disabled={!agentName.trim()}
                style={agentName.trim() ? primaryBtn : disabledBtn}
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
      <div style={overlay} onClick={onClose}>
        <div style={modal} onClick={e => e.stopPropagation()}>
          {stepIndicator}
          <div style={{ color: '#e2e6ea', fontWeight: 700, fontSize: 16, marginBottom: 20 }}>Add First Task</div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Task title</label>
            <input
              style={inputStyle}
              placeholder="Task title"
              value={taskTitle}
              onChange={e => setTaskTitle(e.target.value)}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Description (optional)</label>
            <textarea
              style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
              placeholder="Describe the task…"
              value={taskDesc}
              onChange={e => setTaskDesc(e.target.value)}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Priority</label>
            <select
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={taskPriority}
              onChange={e => setTaskPriority(e.target.value)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div style={btnRow}>
            <button type="button" onClick={skipTask} style={cancelBtn}>Add tasks later</button>
            <button
              type="button"
              onClick={goToLaunch}
              disabled={!taskTitle.trim()}
              style={taskTitle.trim() ? primaryBtn : disabledBtn}
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
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        {stepIndicator}
        <div style={{ color: '#e2e6ea', fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Ready to Launch</div>
        <div style={{ color: '#8a9199', fontSize: 13, marginBottom: 20 }}>
          Your project <strong style={{ color: '#e2e6ea' }}>{name}</strong> is configured and ready to create.
        </div>
        {submitError && <div style={{ color: '#c04040', fontSize: 11, marginBottom: 12 }}>{submitError}</div>}
        <div style={btnRow}>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          {canStartNow && (
            <button
              type="button"
              onClick={() => handleSubmit(true)}
              disabled={submitting}
              style={submitting ? disabledBtn : { ...primaryBtn, background: '#3a8c5c' }}
            >
              {submitting ? 'Creating…' : 'Start now'}
            </button>
          )}
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            disabled={submitting}
            style={submitting ? disabledBtn : primaryBtn}
          >
            {submitting ? 'Creating…' : 'Create & Open'}
          </button>
        </div>
      </div>
    </div>
  )
}
