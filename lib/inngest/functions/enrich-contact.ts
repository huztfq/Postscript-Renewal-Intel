// lib/inngest/functions/enrich-contact.ts
import { type GetStepTools } from 'inngest'
import { inngest } from '../client'
import { supabaseAdmin } from '@/lib/supabase'
import { getPersonProfile, getCurrentCompany } from '@/lib/enrichment/unipile'
import { titlesMismatch } from '@/lib/enrichment/openai'
import type { SignalSeverity } from '@/lib/types'

type StepTools = GetStepTools<typeof inngest>

export const enrichContact = inngest.createFunction(
  { id: 'enrich-contact', throttle: { limit: 1, period: '1s' }, triggers: [{ event: 'renewal/contact.enrich' }] },
  async ({ event, step }: { event: { data: { contactId: string } }; step: StepTools }) => {
    const { contactId } = event.data

    const contact = await step.run('fetch-contact', async () => {
      const { data } = await supabaseAdmin
        .from('contacts')
        .select('*, accounts(name, normalized_name)')
        .eq('id', contactId)
        .single()
      return data
    })

    if (!contact?.linkedin_url) {
      await supabaseAdmin.from('contacts').update({ enrichment_status: 'unenrichable' }).eq('id', contactId)
      return { skipped: true }
    }

    const profile = await step.run('unipile-person', () => getPersonProfile(contact.linkedin_url))

    if (!profile) {
      await supabaseAdmin.from('contacts').update({ enrichment_status: 'unenrichable' }).eq('id', contactId)
      return { skipped: true }
    }

    await step.run('update-contact', async () => {
      await supabaseAdmin.from('contacts').update({
        linkedin_current_title: profile.occupation,
        linkedin_current_company: getCurrentCompany(profile),
        enrichment_status: 'enriched',
        last_enriched_at: new Date().toISOString(),
      }).eq('id', contactId)
    })

    await step.run('generate-signals', async () => {
      const signals: Record<string, unknown>[] = []
      const accountName = (contact as Record<string, unknown> & { accounts?: { name?: string } }).accounts?.name ?? ''
      const currentCompany = getCurrentCompany(profile)

      if (currentCompany && !currentCompany.toLowerCase().includes(accountName.toLowerCase())) {
        const isCritical = contact.point_of_contact_role?.includes('Main POC') || contact.is_champion
        signals.push({
          contact_id: contactId,
          account_id: contact.account_id,
          signal_type: 'left_company',
          severity: (isCritical ? 'critical' : 'warning') as SignalSeverity,
          summary: `${contact.first_name} ${contact.last_name} appears to have left ${accountName}. Current company on LinkedIn: ${currentCompany}.`,
          old_value: accountName,
          new_value: currentCompany,
          source: 'unipile',
        })
      }

      if (contact.title && profile.occupation && titlesMismatch(contact.title, profile.occupation)) {
        signals.push({
          contact_id: contactId,
          account_id: contact.account_id,
          signal_type: 'title_change',
          severity: 'warning' as SignalSeverity,
          summary: `${contact.first_name} ${contact.last_name} title changed: "${contact.title}" → "${profile.occupation}"`,
          old_value: contact.title,
          new_value: profile.occupation,
          source: 'unipile',
        })
      }

      if (signals.length > 0) await supabaseAdmin.from('signals').insert(signals)
    })

    return { enriched: true, contactId }
  },
)
