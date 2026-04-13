// app/contacts/page.tsx
export const dynamic = 'force-dynamic'
import { supabaseAdmin } from '@/lib/supabase'
import Link from 'next/link'
import type { Contact, Account, Signal } from '@/lib/types'
import { SignalBadge } from '@/components/SignalBadge'
import { ExternalLink, Users } from 'lucide-react'

async function getData() {
  const [contactsRes, accountsRes, signalsRes] = await Promise.all([
    supabaseAdmin
      .from('contacts')
      .select('*')
      .not('data_quality_flag', 'in', '("junk","internal","functional")')
      .order('last_name'),
    supabaseAdmin.from('accounts').select('id, name'),
    supabaseAdmin.from('signals').select('contact_id, severity').is('dismissed_at', null).not('contact_id', 'is', null),
  ])
  return {
    contacts: (contactsRes.data ?? []) as Contact[],
    accounts: (accountsRes.data ?? []) as Pick<Account, 'id' | 'name'>[],
    signals: (signalsRes.data ?? []) as Pick<Signal, 'contact_id' | 'severity'>[],
  }
}

export default async function ContactsPage() {
  const { contacts, accounts, signals } = await getData()

  const accountName = new Map(accounts.map(a => [a.id, a.name]))

  const signalsByContact = new Map<string, string[]>()
  for (const s of signals) {
    if (!s.contact_id) continue
    const list = signalsByContact.get(s.contact_id) ?? []
    list.push(s.severity)
    signalsByContact.set(s.contact_id, list)
  }

  const flagColour: Record<string, string> = {
    clean: 'bg-emerald-50 text-emerald-700',
    incomplete: 'bg-gray-100 text-gray-500',
    duplicate: 'bg-yellow-50 text-yellow-700',
    junk: 'bg-red-50 text-red-600',
    internal: 'bg-blue-50 text-blue-600',
    functional: 'bg-orange-50 text-orange-600',
  }

  const enrichColour: Record<string, string> = {
    enriched: 'text-emerald-600',
    pending: 'text-gray-400',
    unenrichable: 'text-red-400',
    skipped: 'text-gray-300',
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Users size={22} className="text-purple-500" />
          Contacts
        </h1>
        <p className="text-sm text-gray-500 mt-1">{contacts.length} contacts across {accounts.length} accounts</p>
      </div>

      {contacts.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Users size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No contacts yet. Upload a CRM CSV to get started.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Title</th>
                <th className="px-4 py-3 text-left">Account</th>
                <th className="px-4 py-3 text-left">Quality</th>
                <th className="px-4 py-3 text-left">Enrichment</th>
                <th className="px-4 py-3 text-left">Signals</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {contacts.map(c => {
                const contactSignals = signalsByContact.get(c.id) ?? []
                const topSeverity = contactSignals.includes('critical') ? 'critical'
                  : contactSignals.includes('warning') ? 'warning'
                  : contactSignals.length > 0 ? 'info' as const
                  : null
                const displayName = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown'
                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Link href={`/accounts/${c.account_id}/contacts/${c.id}`} className="font-medium text-gray-900 hover:text-purple-700">
                          {displayName}
                        </Link>
                        {c.linkedin_url && (
                          <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-blue-500 shrink-0">
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                      {c.email && <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">{c.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <div className="truncate max-w-[160px]">{c.title || '—'}</div>
                      {c.linkedin_current_title && c.linkedin_current_title !== c.title && (
                        <div className="text-xs text-amber-600 truncate max-w-[160px]">↳ {c.linkedin_current_title}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/accounts/${c.account_id}`} className="text-gray-600 hover:text-purple-700 truncate max-w-[130px] block">
                        {accountName.get(c.account_id) ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${flagColour[c.data_quality_flag] ?? 'bg-gray-100 text-gray-500'}`}>
                        {c.data_quality_flag}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-xs font-medium capitalize ${enrichColour[c.enrichment_status] ?? 'text-gray-400'}`}>
                      {c.enrichment_status}
                    </td>
                    <td className="px-4 py-3">
                      {topSeverity ? (
                        <SignalBadge severity={topSeverity} count={contactSignals.length} />
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
