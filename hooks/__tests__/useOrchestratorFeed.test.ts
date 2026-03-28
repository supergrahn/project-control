// hooks/__tests__/useOrchestratorFeed.test.ts
import { beforeEach, test, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOrchestratorFeed } from '../useOrchestratorFeed'
import type { Session } from '../useSessions'

const makeSession = (id: string, phase: string): Session => ({
  id,
  project_id: 'p1',
  label: `Task ${id}`,
  phase,
  source_file: null,
  status: 'active',
  created_at: new Date().toISOString(),
  ended_at: null,
})

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  sent: string[] = []
  readyState = 1
  constructor(public url: string) { MockWebSocket.instances.push(this) }
  send(data: string) { this.sent.push(data) }
  close() { this.readyState = 3; this.onclose?.() }
  emit(data: string) { this.onmessage?.({ data }) }
}

beforeEach(() => { MockWebSocket.instances = [] })
;(global as any).WebSocket = MockWebSocket

test('opens one WebSocket per session', () => {
  const sessions = [makeSession('s1', 'idea'), makeSession('s2', 'plan')]
  renderHook(() => useOrchestratorFeed(sessions))
  expect(MockWebSocket.instances).toHaveLength(2)
})

test('attaches to session on open', () => {
  const sessions = [makeSession('s1', 'idea')]
  renderHook(() => useOrchestratorFeed(sessions))
  act(() => { MockWebSocket.instances[0].onopen?.() })
  expect(JSON.parse(MockWebSocket.instances[0].sent[0])).toEqual({ type: 'attach', sessionId: 's1' })
})

test('appends output to feed', () => {
  const sessions = [makeSession('s1', 'idea')]
  const { result } = renderHook(() => useOrchestratorFeed(sessions))
  act(() => {
    MockWebSocket.instances[0].onopen?.()
    MockWebSocket.instances[0].emit(JSON.stringify({ type: 'output', data: 'hello\n' }))
  })
  expect(result.current.feed).toHaveLength(1)
  expect(result.current.feed[0].text).toBe('hello\n')
  expect(result.current.feed[0].sessionId).toBe('s1')
  expect(result.current.feed[0].label).toBe('Task s1')
  expect(result.current.feed[0].phase).toBe('idea')
  expect(result.current.feed[0].timestamp).toBeDefined()
})

test('closes WebSocket when session removed', () => {
  const sessions = [makeSession('s1', 'idea')]
  const { rerender } = renderHook(({ s }) => useOrchestratorFeed(s), { initialProps: { s: sessions } })
  act(() => { MockWebSocket.instances[0].onopen?.() })
  rerender({ s: [] })
  expect(MockWebSocket.instances[0].readyState).toBe(3)
})

test('ignores non-output WebSocket messages', () => {
  const sessions = [makeSession('s1', 'idea')]
  const { result } = renderHook(() => useOrchestratorFeed(sessions))
  act(() => {
    MockWebSocket.instances[0].onopen?.()
    MockWebSocket.instances[0].emit(JSON.stringify({ type: 'status', data: 'ended' }))
  })
  expect(result.current.feed).toHaveLength(0)
})
