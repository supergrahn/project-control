import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { SessionWindowProvider, useSessionWindows } from '../useSessionWindows'
import type { Session } from '../useSessions'
import React from 'react'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SessionWindowProvider>{children}</SessionWindowProvider>
)

const makeSession = (id: string): Session => ({
  id,
  project_id: 'proj-1',
  label: 'My Idea · ideate',
  phase: 'ideate',
  source_file: '/data/ideas/my-idea.md',
  status: 'active',
  created_at: new Date().toISOString(),
  ended_at: null,
})

describe('useSessionWindows', () => {
  it('opens a window', () => {
    const { result } = renderHook(() => useSessionWindows(), { wrapper })
    act(() => result.current.openWindow(makeSession('s1')))
    expect(result.current.windows).toHaveLength(1)
    expect(result.current.windows[0].session.id).toBe('s1')
  })

  it('does not duplicate already-open windows', () => {
    const { result } = renderHook(() => useSessionWindows(), { wrapper })
    act(() => result.current.openWindow(makeSession('s1')))
    act(() => result.current.openWindow(makeSession('s1')))
    expect(result.current.windows).toHaveLength(1)
  })

  it('minimizes and restores a window', () => {
    const { result } = renderHook(() => useSessionWindows(), { wrapper })
    act(() => result.current.openWindow(makeSession('s1')))
    act(() => result.current.minimizeWindow('s1'))
    expect(result.current.windows[0].minimized).toBe(true)
    act(() => result.current.restoreWindow('s1'))
    expect(result.current.windows[0].minimized).toBe(false)
  })

  it('closes a window', () => {
    const { result } = renderHook(() => useSessionWindows(), { wrapper })
    act(() => result.current.openWindow(makeSession('s1')))
    act(() => result.current.closeWindow('s1'))
    expect(result.current.windows).toHaveLength(0)
  })
})
