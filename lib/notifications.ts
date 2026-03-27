export type NotificationEventType = 'gate_waiting' | 'session_complete' | 'risk_detected' | 'all_done'

export interface NotificationEvent {
  type: NotificationEventType
  project: string
  summary: string
  url?: string
}

export interface NotificationChannel {
  name: string
  send(event: NotificationEvent): Promise<void>
}

type Severity = 'info' | 'warn' | 'override'

const EVENT_SEVERITY: Record<NotificationEventType, Severity> = {
  gate_waiting: 'warn',
  session_complete: 'info',
  risk_detected: 'override',
  all_done: 'info',
}

export class InAppChannel implements NotificationChannel {
  name = 'in-app'
  constructor(private logFn: (entry: { severity: Severity; summary: string; project: string }) => void) {}

  async send(event: NotificationEvent): Promise<void> {
    this.logFn({
      severity: EVENT_SEVERITY[event.type],
      summary: event.summary,
      project: event.project,
    })
  }
}

export class SlackChannel implements NotificationChannel {
  name = 'slack'
  constructor(
    private webhookUrl: string,
    private fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  async send(event: NotificationEvent): Promise<void> {
    try {
      await this.fetchFn(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `[${event.project}] ${event.summary}`,
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `*${event.project}*\n${event.summary}${event.url ? `\n<${event.url}|View>` : ''}` },
            },
          ],
        }),
      })
    } catch {
      // network error — swallow silently
    }
  }
}

export class BrowserDesktopChannel implements NotificationChannel {
  name = 'desktop'

  async send(event: NotificationEvent): Promise<void> {
    // This is a server-side stub — actual desktop notifications
    // would be triggered via SSE push to the browser client
    console.log(`[desktop-notify] ${event.project}: ${event.summary}`)
  }
}

export class NotificationService {
  constructor(private channels: NotificationChannel[]) {}

  async notify(event: NotificationEvent): Promise<void> {
    for (const ch of this.channels) {
      try {
        await ch.send(event)
      } catch {
        // continue to next channel
      }
    }
  }
}
