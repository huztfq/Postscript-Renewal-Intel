// components/StakeholderPanel.tsx
import type { Contact, Signal } from '@/lib/types'
import { ContactCard } from './ContactCard'
import { UserPlus } from 'lucide-react'

export function StakeholderPanel({ accountId, contacts, signals }: { accountId: string; contacts: Contact[]; signals: Signal[] }) {
  const crmContacts = contacts.filter(c =>
    c.data_quality_flag !== 'junk' && c.data_quality_flag !== 'internal' && c.data_quality_flag !== 'functional'
  )
  const newStakeholderSignals = signals.filter(s => s.signal_type === 'new_stakeholder' && !s.dismissed_at)

  function getContactSignals(contactId: string) {
    return signals.filter(s => s.contact_id === contactId)
  }

  const sorted = [...crmContacts].sort((a, b) => {
    const scoreA = (a.point_of_contact_role ? 3 : 0) + (a.is_champion ? 2 : 0) + (a.is_relevant_stakeholder ? 1 : 0)
    const scoreB = (b.point_of_contact_role ? 3 : 0) + (b.is_champion ? 2 : 0) + (b.is_relevant_stakeholder ? 1 : 0)
    return scoreB - scoreA
  })

  return (
    <div className="grid grid-cols-2 gap-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          In CRM <span className="text-gray-400 font-normal">({crmContacts.length})</span>
        </h3>
        <div className="space-y-2">
          {sorted.map(c => (
            <ContactCard key={c.id} contact={c} signals={getContactSignals(c.id)} accountId={accountId} />
          ))}
          {crmContacts.length === 0 && <p className="text-sm text-gray-400">No contacts in CRM.</p>}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
          <UserPlus size={14} className="text-emerald-600" />
          Not in CRM <span className="text-gray-400 font-normal">({newStakeholderSignals.length})</span>
        </h3>
        <div className="space-y-2">
          {newStakeholderSignals.map(s => (
            <div key={s.id} className="p-3 rounded-lg border border-emerald-100 bg-emerald-50">
              <p className="text-xs text-gray-700">{s.summary}</p>
              {s.new_value && (
                <a href={s.new_value} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1 block">
                  View LinkedIn →
                </a>
              )}
            </div>
          ))}
          {newStakeholderSignals.length === 0 && (
            <p className="text-sm text-gray-400">No new stakeholders detected. Run enrichment to check.</p>
          )}
        </div>
      </div>
    </div>
  )
}
