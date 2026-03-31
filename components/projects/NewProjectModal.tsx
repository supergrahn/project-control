'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAddProject } from '@/hooks/useProjects'

type Props = { onClose: () => void }

export function NewProjectModal({ onClose }: Props) {
  const router = useRouter()
  const addProject = useAddProject()
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [pathError, setPathError] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)

  async function validatePath(rawPath: string) {
    if (!rawPath.trim()) return
    setValidating(true)
    setPathError(null)
    try {
      const res = await fetch(`/api/projects/validate-path?path=${encodeURIComponent(rawPath.trim())}`)
      const data = await res.json()
      if (data.valid) {
        if (!name) setName(data.name)
        setPathError(null)
      } else {
        setPathError(data.error ?? 'Not a git repository')
      }
    } catch {
      setPathError('Could not validate path')
    } finally {
      setValidating(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!path.trim() || !name.trim() || pathError) return
    const result = await addProject.mutateAsync({ name: name.trim(), path: path.trim() })
    onClose()
    router.push(`/projects/${result.id}`)
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  }
  const modal: React.CSSProperties = {
    background: '#141618', border: '1px solid #1e2124', borderRadius: 10,
    padding: 28, width: 420, fontFamily: 'system-ui, sans-serif',
  }
  const label: React.CSSProperties = { color: '#8a9199', fontSize: 11, marginBottom: 6, display: 'block' }
  const input: React.CSSProperties = {
    width: '100%', background: '#0d0e10', border: '1px solid #1e2124', borderRadius: 6,
    color: '#e2e6ea', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box', outline: 'none',
  }
  const btnRow: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ color: '#e2e6ea', fontWeight: 700, fontSize: 16, marginBottom: 20 }}>
          Add Project
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={label}>Git repo path</label>
            <input
              style={{ ...input, borderColor: pathError ? '#c04040' : '#1e2124' }}
              placeholder="/absolute/path/to/repo"
              value={path}
              onChange={e => { setPath(e.target.value); setPathError(null) }}
              onBlur={e => validatePath(e.target.value)}
              autoFocus
            />
            {validating && <div style={{ color: '#5a6370', fontSize: 11, marginTop: 4 }}>Checking…</div>}
            {pathError && <div style={{ color: '#c04040', fontSize: 11, marginTop: 4 }}>{pathError}</div>}
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={label}>Project name</label>
            <input
              style={input}
              placeholder="Project name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div style={btnRow}>
            <button type="button" onClick={onClose}
              style={{ background: 'none', border: '1px solid #1e2124', color: '#8a9199', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>
              Cancel
            </button>
            <button type="submit"
              disabled={!path.trim() || !name.trim() || !!pathError || validating || addProject.isPending}
              style={{
                background: !path.trim() || !name.trim() || !!pathError ? '#1c1f22' : '#5b9bd5',
                border: 'none', color: '#e2e6ea', borderRadius: 6, padding: '7px 14px',
                cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}>
              {addProject.isPending ? 'Adding…' : 'Add Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
