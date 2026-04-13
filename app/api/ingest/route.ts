// app/api/ingest/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { flagContact, isRelevantStakeholder } from '@/lib/cleaning/validate'
import { resolveAccountFromRow } from '@/lib/cleaning/normalize'
import { deduplicateContacts } from '@/lib/cleaning/dedup'
import type { RawCsvRow, NormalizedContact, NormalizedAccount, EnrichmentStatus } from '@/lib/types'

export async function POST(req: NextRequest) {
  const { rows }: { rows: RawCsvRow[] } = await req.json()

  // ── 1. Resolve accounts (deduplicated by normalized_name) ─────────────────
  const accountMap = new Map<string, NormalizedAccount>()
  for (const row of rows) {
    const acc = resolveAccountFromRow(row)
    if (!accountMap.has(acc.normalized_name)) {
      accountMap.set(acc.normalized_name, acc)
    } else {
      const existing = accountMap.get(acc.normalized_name)!
      if (acc.account_owner && acc.account_owner !== 'System Connector') existing.account_owner = acc.account_owner
      if (acc.account_csm   && acc.account_csm   !== 'System Connector') existing.account_csm   = acc.account_csm
      if (acc.linkedin_company_url && !existing.linkedin_company_url)    existing.linkedin_company_url = acc.linkedin_company_url
    }
  }

  const accountsToInsert = Array.from(accountMap.values()).filter(a => !a.quarantine)
  const quarantined = new Set(Array.from(accountMap.values()).filter(a => a.quarantine).map(a => a.normalized_name))

  // ── 2. BULK upsert accounts (1 DB call) ───────────────────────────────────
  const { data: insertedAccounts, error: accError } = await supabaseAdmin
    .from('accounts')
    .upsert(
      accountsToInsert.map(a => ({
        name: a.name,
        normalized_name: a.normalized_name,
        website: a.website || null,
        linkedin_company_url: a.linkedin_company_url || null,
        account_owner: a.account_owner || null,
        account_csm: a.account_csm || null,
        account_stage: a.account_stage || null,
      })),
      { onConflict: 'normalized_name', ignoreDuplicates: false },
    )
    .select('id, normalized_name')

  if (accError) return NextResponse.json({ error: accError.message }, { status: 500 })

  const accountIdMap = new Map<string, string>()
  for (const acc of insertedAccounts ?? []) accountIdMap.set(acc.normalized_name, acc.id)

  // ── 3. Build + deduplicate contacts ───────────────────────────────────────
  const rawContacts: NormalizedContact[] = rows
    .map((row): NormalizedContact | null => {
      const acc = resolveAccountFromRow(row)
      if (quarantined.has(acc.normalized_name)) return null
      if (!accountIdMap.has(acc.normalized_name)) return null

      const flag       = flagContact(row)
      const title      = row['Title']?.trim() ?? ''
      const poc        = row['Point of Contact']?.trim() ?? ''
      const hasLinkedIn = !!row['LinkedIn URL']?.trim()
      const enrichment_status: EnrichmentStatus =
        flag === 'junk' || flag === 'duplicate' || flag === 'internal' || flag === 'functional'
          ? 'skipped'
          : hasLinkedIn ? 'pending' : 'unenrichable'

      return {
        first_name: row['First Name']?.trim() || null,
        last_name:  row['Last Name']?.trim()  || null,
        email:      row['Email']?.trim()       || null,
        title:      title  || null,
        linkedin_url: row['LinkedIn URL']?.trim() || null,
        is_champion:            !!row['Champion']?.trim(),
        is_contract_signer:     !!row['Contract Signer']?.trim(),
        is_relevant_stakeholder: isRelevantStakeholder(title),
        point_of_contact_role: poc,
        lead_source:       row['Lead Source']?.trim()                  || null,
        first_touch_date:  row['First Touch Campaign Date']?.trim()    || null,
        data_quality_flag: flag,
        enrichment_status,
        account_normalized_name: acc.normalized_name,
      }
    })
    .filter((c): c is NormalizedContact => c !== null)

  const deduped = deduplicateContacts(rawContacts)

  // ── 4. BULK upsert contacts split by whether they have an email ────────────
  // (email-keyed contacts use the UNIQUE(account_id,email) constraint;
  //  email-less contacts use insert with ignoreDuplicates so re-uploads don't dupe)

  const toRow = (c: NormalizedContact) => ({
    account_id:              accountIdMap.get(c.account_normalized_name)!,
    first_name:              c.first_name,
    last_name:               c.last_name,
    email:                   c.email,
    title:                   c.title,
    linkedin_url:            c.linkedin_url,
    is_champion:             c.is_champion,
    is_contract_signer:      c.is_contract_signer,
    is_relevant_stakeholder: c.is_relevant_stakeholder,
    point_of_contact_role:   c.point_of_contact_role || null,
    lead_source:             c.lead_source,
    first_touch_date:        c.first_touch_date,
    data_quality_flag:       c.data_quality_flag,
    enrichment_status:       c.enrichment_status,
  })

  const withEmail    = deduped.filter(c => c.email)
  const withoutEmail = deduped.filter(c => !c.email)

  const contactErrors: string[] = []

  // Single bulk upsert for contacts that have an email
  if (withEmail.length > 0) {
    const { error } = await supabaseAdmin
      .from('contacts')
      .upsert(withEmail.map(toRow), { onConflict: 'account_id,email', ignoreDuplicates: false })
    if (error) contactErrors.push(error.message)
  }

  // Email-less contacts split by whether they have a LinkedIn URL.
  // Those with LinkedIn use UNIQUE(account_id, linkedin_url) as the conflict key.
  // Those with neither fall back to insert-ignore so re-uploads don't crash.
  const withLinkedIn    = withoutEmail.filter(c => c.linkedin_url)
  const withNeither     = withoutEmail.filter(c => !c.linkedin_url)

  if (withLinkedIn.length > 0) {
    const { error } = await supabaseAdmin
      .from('contacts')
      .upsert(withLinkedIn.map(toRow), { onConflict: 'account_id,linkedin_url', ignoreDuplicates: false })
    if (error) contactErrors.push(error.message)
  }

  if (withNeither.length > 0) {
    const { error } = await supabaseAdmin
      .from('contacts')
      .insert(withNeither.map(toRow))
    // Only hard-fail on real errors; duplicate inserts for fully anonymous contacts are tolerated.
    if (error && !error.message.toLowerCase().includes('duplicate')) contactErrors.push(error.message)
  }

  if (contactErrors.length > 0) {
    return NextResponse.json({ error: contactErrors.join('; ') }, { status: 500 })
  }

  // ── 5. BULK update account scores (1 DB call) ─────────────────────────────
  const scoreUpdates = accountsToInsert.map(a => {
    const accountContacts = deduped.filter(c => c.account_normalized_name === a.normalized_name)
    const total = accountContacts.length
    const clean = accountContacts.filter(c => c.data_quality_flag === 'clean').length
    const score = total > 0 ? clean / total : 0
    return {
      id: accountIdMap.get(a.normalized_name)!,
      normalized_name: a.normalized_name,
      name: a.name,
      data_quality_score: score,
      crm_health_score:   score * 0.7,
    }
  }).filter(u => u.id)

  if (scoreUpdates.length > 0) {
    await supabaseAdmin
      .from('accounts')
      .upsert(scoreUpdates, { onConflict: 'normalized_name', ignoreDuplicates: false })
  }

  return NextResponse.json({
    success: true,
    accountIds: Array.from(accountIdMap.values()),
    stats: { accounts: accountsToInsert.length, contacts: deduped.length },
  })
}
