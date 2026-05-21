import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { requireToken, checkWsToken } from '@/lib/timeballoon-auth'

let originalToken: string | undefined

beforeEach(() => { originalToken = process.env.TIMEBALLOON_SYNC_TOKEN })
afterEach(() => {
  if (originalToken === undefined) delete process.env.TIMEBALLOON_SYNC_TOKEN
  else process.env.TIMEBALLOON_SYNC_TOKEN = originalToken
})

function req(authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('authorization', authHeader)
  return new NextRequest('http://localhost/api/timeballoon/sync', { headers })
}

describe('requireToken', () => {
  it('returns 503 when no token is configured (fail closed)', async () => {
    delete process.env.TIMEBALLOON_SYNC_TOKEN
    const r = requireToken(req('Bearer anything'))
    expect(r).not.toBeNull()
    expect(r!.status).toBe(503)
  })

  it('returns 401 when bearer token is missing', () => {
    process.env.TIMEBALLOON_SYNC_TOKEN = 'secret'
    const r = requireToken(req())
    expect(r).not.toBeNull()
    expect(r!.status).toBe(401)
  })

  it('returns 401 when bearer token is wrong', () => {
    process.env.TIMEBALLOON_SYNC_TOKEN = 'secret'
    const r = requireToken(req('Bearer wrong'))
    expect(r).not.toBeNull()
    expect(r!.status).toBe(401)
  })

  it('returns null (authorized) when bearer token matches', () => {
    process.env.TIMEBALLOON_SYNC_TOKEN = 'secret'
    const r = requireToken(req('Bearer secret'))
    expect(r).toBeNull()
  })

  it('returns 401 on partial-match attempts (length mismatch)', () => {
    process.env.TIMEBALLOON_SYNC_TOKEN = 'secret'
    expect(requireToken(req('Bearer secr'))?.status).toBe(401)
    expect(requireToken(req('Bearer secretX'))?.status).toBe(401)
  })
})

describe('checkWsToken', () => {
  it('accepts token in query string', () => {
    process.env.TIMEBALLOON_SYNC_TOKEN = 'secret'
    expect(checkWsToken('?token=secret')).toBe(true)
  })

  it('rejects missing or wrong token', () => {
    process.env.TIMEBALLOON_SYNC_TOKEN = 'secret'
    expect(checkWsToken('')).toBe(false)
    expect(checkWsToken('?token=wrong')).toBe(false)
  })

  it('fails closed when no server token configured', () => {
    delete process.env.TIMEBALLOON_SYNC_TOKEN
    expect(checkWsToken('?token=anything')).toBe(false)
  })
})
