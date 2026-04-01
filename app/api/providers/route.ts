import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getDb } from '@/lib/db'
import { getProviders, createProvider } from '@/lib/db/providers'
import type { ProviderType } from '@/lib/db/providers'

const VALID_TYPES: ProviderType[] = ['claude', 'codex', 'gemini', 'ollama']

export async function GET(_req: NextRequest) {
  return NextResponse.json(getProviders(getDb()))
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, type, command, config } = body

  if (!name?.trim() || !type || !command?.trim()) {
    return NextResponse.json({ error: 'name, type, and command are required' }, { status: 400 })
  }
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 })
  }

  const provider = createProvider(getDb(), {
    id: randomUUID(),
    name: name.trim(),
    type,
    command: command.trim(),
    config: config ?? null,
  })
  return NextResponse.json(provider, { status: 201 })
}
