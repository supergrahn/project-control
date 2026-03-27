import { NextResponse } from 'next/server'
import { getDb, getTodayPlan, saveDailyPlan } from '@/lib/db'

export async function GET() {
  const plan = getTodayPlan(getDb())
  return NextResponse.json({ plan: plan ? { ...plan, items: JSON.parse(plan.items) } : null })
}

export async function POST(req: Request) {
  const { items } = await req.json()
  if (!Array.isArray(items)) return NextResponse.json({ error: 'items must be an array' }, { status: 400 })
  saveDailyPlan(getDb(), JSON.stringify(items))
  return NextResponse.json({ ok: true })
}
