import { renderHook, act } from '@testing-library/react'
import { useRef, useEffect } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// xterm mocks — we use plain classes for the constructors because vitest 4's
// vi.fn().mockImplementation factories are not constructable with `new`.
// Spies are shared via vi.hoisted so they're created before the (also hoisted)
// vi.mock factories run.
const { writeSpy, disposeSpy, onDataSpy, onResizeSpy, fitSpy, openSpy, loadAddonSpy } = vi.hoisted(() => ({
  writeSpy: vi.fn(),
  disposeSpy: vi.fn(),
  onDataSpy: vi.fn(),
  onResizeSpy: vi.fn(),
  fitSpy: vi.fn(),
  openSpy: vi.fn(),
  loadAddonSpy: vi.fn(),
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class MockTerminal {
    open = openSpy
    write = writeSpy
    dispose = disposeSpy
    onData = onDataSpy
    onResize = onResizeSpy
    loadAddon = loadAddonSpy
  },
}))
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class MockFitAddon {
    fit = fitSpy
  },
}))

// WebSocket mock — capture every constructed instance for assertions
const wsInstances: MockWebSocket[] = []
class MockWebSocket {
  static OPEN = 1
  static CLOSED = 3
  readyState = 0
  onopen: ((e: any) => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: ((e: any) => void) | null = null
  onclose: ((e: any) => void) | null = null
  send = vi.fn()
  close = vi.fn(() => { this.readyState = MockWebSocket.CLOSED })
  constructor(public url: string) {
    wsInstances.push(this)
    // Open async to mimic real WS lifecycle
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN
      this.onopen?.({})
    })
  }
}

class MockResizeObserver {
  observe = vi.fn(); disconnect = vi.fn(); unobserve = vi.fn()
}

import { useSessionTerminal } from '@/hooks/useSessionTerminal'

beforeEach(() => {
  ;(globalThis as any).WebSocket = MockWebSocket
  ;(globalThis as any).ResizeObserver = MockResizeObserver
  wsInstances.length = 0
  vi.clearAllMocks()
})

afterEach(() => {
  // Note: vi.restoreAllMocks() removed — it would wipe the Terminal/FitAddon
  // mockImplementation factories for subsequent tests. clearAllMocks() in
  // beforeEach resets call history without breaking implementations.
})

// Harness: mounts a real DOM node and runs the hook against it.
// We use a synchronous useLayoutEffect-equivalent (set ref before useSessionTerminal effect runs)
// by initializing the ref via a callback ref on first render.
function makeHarness() {
  return renderHook(
    ({ sessionId, enabled }: { sessionId: string; enabled: boolean }) => {
      const ref = useRef<HTMLDivElement>(null)
      useEffect(() => {
        if (!ref.current) ref.current = document.createElement('div')
      }, [])
      // Force the ref non-null synchronously for the hook's first effect run
      if (!ref.current) ref.current = document.createElement('div')
      return useSessionTerminal({ sessionId, containerRef: ref, enabled })
    },
    { initialProps: { sessionId: 's1', enabled: true } }
  )
}

async function flush() {
  // The hook's init does: await import + await import + RAF.
  // Pump several microtask + RAF + macrotask cycles to ensure all resolve.
  for (let i = 0; i < 5; i++) {
    await new Promise<void>(r => requestAnimationFrame(() => r()))
    await Promise.resolve()
    await new Promise(r => setTimeout(r, 0))
  }
}

describe('useSessionTerminal', () => {
  it('returns connecting state initially when disabled', () => {
    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(null)
      return useSessionTerminal({ sessionId: 's1', containerRef: ref, enabled: false })
    })
    expect(result.current.termStatus).toBe('connecting')
    expect(wsInstances).toHaveLength(0)
  })

  it('opens a WebSocket and sends attach with the sessionId when enabled', async () => {
    // Mount directly with the desired sessionId — the immediate rerender pattern
    // races with the dynamic-import inside init() under vitest 4.
    renderHook(() => {
      const ref = useRef<HTMLDivElement>(null)
      if (!ref.current) ref.current = document.createElement('div')
      return useSessionTerminal({ sessionId: 'sess-42', containerRef: ref, enabled: true })
    })
    await flush()
    expect(wsInstances.length).toBeGreaterThan(0)
    const lastWs = wsInstances[wsInstances.length - 1]
    expect(lastWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'attach', sessionId: 'sess-42' }))
  })

  it('writes output messages to terminal with trailing CRLF', async () => {
    makeHarness()
    await flush()
    const ws = wsInstances[wsInstances.length - 1]
    ws.onmessage?.({ data: JSON.stringify({ type: 'output', data: 'hello' }) })
    expect(writeSpy).toHaveBeenCalledWith('hello\r\n')
  })

  it('updates state from status messages', async () => {
    const { result } = makeHarness()
    await flush()
    const ws = wsInstances[wsInstances.length - 1]
    await act(async () => {
      ws.onmessage?.({ data: JSON.stringify({
        type: 'status', state: 'unresponsive', reason: 'oom', message: 'killed', provider: 'claude', retryAfter: 30,
      }) })
    })
    expect(result.current.sessionState).toBe('unresponsive')
    expect(result.current.sessionReason).toBe('oom')
    expect(result.current.sessionMessage).toBe('killed')
    expect(result.current.sessionProvider).toBe('claude')
    expect(result.current.retryAfter).toBe(30)
  })

  it('derives termStatus=active after status message with state=active', async () => {
    const { result } = makeHarness()
    await flush()
    const ws = wsInstances[wsInstances.length - 1]
    await act(async () => {
      ws.onmessage?.({ data: JSON.stringify({ type: 'status', state: 'active' }) })
    })
    expect(result.current.termStatus).toBe('active')
  })

  it('derives termStatus=ended on WebSocket error', async () => {
    const { result } = makeHarness()
    await flush()
    const ws = wsInstances[wsInstances.length - 1]
    await act(async () => {
      ws.onerror?.({})
    })
    expect(result.current.termStatus).toBe('ended')
  })

  it('disposes terminal and closes WebSocket on unmount', async () => {
    const { unmount } = makeHarness()
    await flush()
    const ws = wsInstances[wsInstances.length - 1]
    unmount()
    expect(disposeSpy).toHaveBeenCalled()
    expect(ws.close).toHaveBeenCalled()
  })

  it('tears down and re-inits when sessionId changes', async () => {
    const harness = makeHarness()
    await flush()
    const firstDisposes = disposeSpy.mock.calls.length
    const firstWsCount = wsInstances.length
    harness.rerender({ sessionId: 's2', enabled: true })
    await flush()
    expect(disposeSpy.mock.calls.length).toBeGreaterThan(firstDisposes)
    expect(wsInstances.length).toBeGreaterThan(firstWsCount)
    const newWs = wsInstances[wsInstances.length - 1]
    expect(newWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'attach', sessionId: 's2' }))
  })

  it('tears down when enabled flips to false', async () => {
    const harness = makeHarness()
    await flush()
    const firstDisposes = disposeSpy.mock.calls.length
    harness.rerender({ sessionId: 's1', enabled: false })
    await flush()
    expect(disposeSpy.mock.calls.length).toBeGreaterThan(firstDisposes)
  })

  it('re-inits when enabled flips false → true (per spec contract)', async () => {
    const { rerender } = renderHook(
      ({ on }: { on: boolean }) => {
        const ref = useRef<HTMLDivElement>(null)
        if (!ref.current) ref.current = document.createElement('div')
        return useSessionTerminal({ sessionId: 's1', containerRef: ref, enabled: on })
      },
      { initialProps: { on: false } }
    )
    expect(wsInstances).toHaveLength(0)
    rerender({ on: true })
    await flush()
    expect(wsInstances.length).toBeGreaterThan(0)
  })
})
