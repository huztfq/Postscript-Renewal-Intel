// lib/inngest/functions/detect-stakeholders.ts
import { type GetStepTools } from 'inngest'
import { inngest } from '../client'
import { supabaseAdmin } from '@/lib/supabase'
import { getCompanyEmployees, type LinkedInEmployee } from '@/lib/enrichment/unipile'
import { RELEVANT_TITLE_KEYWORDS } from '@/lib/cleaning/validate'

type StepTools = GetStepTools<typeof inngest>

export const detectStakeholders = inngest.createFunction(
  { id: 'detect-stakeholders', triggers: [{ event: 'renewal/account.detect-stakeholders' }] },
  async ({ event, step }: { event: { data: { accountId: string } }; step: StepTools }) => {
    const { accountId } = event.data

    const account = await step.run('fetch-account', async () => {
      const { data } = await supabaseAdmin.from('accounts').select('id, name, linkedin_company_url').eq('id', accountId).single()
      return data
    })

    if (!account?.linkedin_company_url) return { skipped: true, reason: 'no company linkedin url' }

    const employees = await step.run('unipile-employees', () =>
      getCompanyEmployees(account.linkedin_company_url!, RELEVANT_TITLE_KEYWORDS)
    )

    if (!employees.length) return { skipped: true, reason: 'no employees returned' }

    const existingContacts = await step.run('fetch-existing-contacts', async () => {
      const { data } = await supabaseAdmin.from('contacts').select('linkedin_url').eq('account_id', accountId)
      return data ?? []
    })

    const knownLinkedIn = new Set(
      existingContacts.map((c: { linkedin_url: string | null }) => c.linkedin_url?.toLowerCase().replace(/\/$/, '')).filter(Boolean)
    )

    await step.run('create-signals', async () => {
      const signals = (employees as LinkedInEmployee[])
        .filter((e: LinkedInEmployee) => {
          const url = e.profile_url?.toLowerCase().replace(/\/$/, '')
          return url && !knownLinkedIn.has(url)
        })
        .map((e: LinkedInEmployee) => ({
          account_id: accountId,
          signal_type: 'new_stakeholder',
          severity: 'info' as const,
          summary: `${e.first_name} ${e.last_name} found at ${account.name} on LinkedIn — not in CRM. Profile: ${e.profile_url}`,
          new_value: e.profile_url,
          source: 'unipile',
        }))
      if (signals.length > 0) await supabaseAdmin.from('signals').insert(signals)
    })

    return { detected: employees.length, accountId }
  },
)
