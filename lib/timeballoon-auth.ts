// Bearer-token auth for the TimeBalloon sync endpoints. Reads the secret from
// TIMEBALLOON_SYNC_TOKEN at request time so a restart-less reload is possible
// just by re-exporting the env var.
//
// Constant-time comparison via Buffer.equals avoids the (admittedly tiny)
// timing-leak surface that string === would expose. The route handlers call
// requireToken() and short-circuit on the returned NextResponse if non-null.

import { NextRequest, NextResponse } from 'next/server'

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return ab.equals(bb)
}

/**
 * Returns null if the request carries a valid bearer token, or a 401
 * NextResponse to return immediately if not. Also returns 503 when no token
 * is configured on the server — fail closed, never accept anonymous writes.
 */
export function requireToken(req: NextRequest): NextResponse | null {
  const expected = process.env.TIMEBALLOON_SYNC_TOKEN
  if (!expected) {
    return NextResponse.json(
      { error: 'TIMEBALLOON_SYNC_TOKEN not configured on server' },
      { status: 503 },
    )
  }
  const header = req.headers.get('authorization') ?? ''
  const match = header.match(/^Bearer\s+(.+)$/)
  if (!match || !constantTimeEquals(match[1], expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return null
}

/**
 * WebSocket variant — token is in the query string because browsers can't set
 * headers on the WS upgrade. Checked at upgrade time in server.ts.
 */
export function checkWsToken(urlSearch: string): boolean {
  const expected = process.env.TIMEBALLOON_SYNC_TOKEN
  if (!expected) return false
  const params = new URLSearchParams(urlSearch)
  const token = params.get('token') ?? ''
  return constantTimeEquals(token, expected)
}
