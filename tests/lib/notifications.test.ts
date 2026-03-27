import { describe, it, expect, vi } from 'vitest'
import {
  NotificationService, InAppChannel, SlackChannel,
  type NotificationEvent,
} from '@/lib/notifications'

const event: NotificationEvent = {
  type: 'gate_waiting',
  project: 'project-control',
  summary: 'Gate waiting: DB migration detected.',
  url: 'http://localhost:3001/sessions',
}

describe('InAppChannel', () => {
  it('calls logFn with warn severity for gate_waiting', async () => {
    const logFn = vi.fn()
    await new InAppChannel(logFn).send(event)
    expect(logFn).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warn', summary: event.summary })
    )
  })

  it('uses info severity for session_complete', async () => {
    const logFn = vi.fn()
    await new InAppChannel(logFn).send({ ...event, type: 'session_complete' })
    expect(logFn).toHaveBeenCalledWith(expect.objectContaining({ severity: 'info' }))
  })
})

describe('SlackChannel', () => {
  it('POSTs to webhook URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    await new SlackChannel('https://hooks.slack.com/test', fetchMock).send(event)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.slack.com/test',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('does not throw if fetch fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network error'))
    await expect(new SlackChannel('https://hooks.slack.com/test', fetchMock).send(event)).resolves.not.toThrow()
  })
})

describe('NotificationService', () => {
  it('dispatches to all channels', async () => {
    const ch1 = { name: 'in-app', send: vi.fn().mockResolvedValue(undefined) }
    const ch2 = { name: 'slack', send: vi.fn().mockResolvedValue(undefined) }
    await new NotificationService([ch1, ch2]).notify(event)
    expect(ch1.send).toHaveBeenCalledWith(event)
    expect(ch2.send).toHaveBeenCalledWith(event)
  })

  it('continues to remaining channels if one throws', async () => {
    const ch1 = { name: 'broken', send: vi.fn().mockRejectedValue(new Error('fail')) }
    const ch2 = { name: 'ok', send: vi.fn().mockResolvedValue(undefined) }
    await new NotificationService([ch1, ch2]).notify(event)
    expect(ch2.send).toHaveBeenCalled()
  })
})
