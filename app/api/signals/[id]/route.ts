// app/api/signals/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { error } = await supabaseAdmin
    .from('signals')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
