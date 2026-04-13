// app/api/enrich/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/lib/inngest/client'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { accountIds }: { accountIds: string[] } = await req.json()

  // Fetch all pending contacts for these accounts
  const { data: allPending } = await supabaseAdmin
    .from('contacts')
    .select('id, linkedin_url')
    .in('account_id', accountIds)
    .eq('enrichment_status', 'pending')

  const pending = allPending ?? []

  // Immediately mark contacts with no LinkedIn URL as unenrichable (catch-all for
  // rows that slipped through with 'pending' before this fix was deployed).
  const noLinkedIn = pending.filter(c => !c.linkedin_url)
  if (noLinkedIn.length > 0) {
    await supabaseAdmin
      .from('contacts')
      .update({ enrichment_status: 'unenrichable' })
      .in('id', noLinkedIn.map(c => c.id))
  }

  const withLinkedIn = pending.filter(c => !!c.linkedin_url)

  const contactEvents = withLinkedIn.map(c => ({
    name: 'renewal/contact.enrich' as const,
    data: { contactId: c.id },
  }))

  const accountEvents = accountIds.flatMap(accountId => [
    { name: 'renewal/account.detect-stakeholders' as const, data: { accountId } },
    { name: 'renewal/account.industry-intel' as const, data: { accountId } },
  ])

  const allEvents = [...contactEvents, ...accountEvents]

  let inngestOk = false
  let inngestError: string | null = null

  if (allEvents.length > 0) {
    try {
      await inngest.send(allEvents)
      inngestOk = true
    } catch (err) {
      inngestError = err instanceof Error ? err.message : String(err)
      console.error('[enrich] Inngest send failed:', inngestError)
    }
  } else {
    inngestOk = true
  }

  return NextResponse.json({
    success: true,
    dispatched: {
      contacts: contactEvents.length,
      accounts: accountIds.length,
      markedUnenrichable: noLinkedIn.length,
    },
    inngestOk,
    ...(inngestError ? { inngestWarning: inngestError } : {}),
  })
}
