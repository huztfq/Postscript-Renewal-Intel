// components/ContactCard.tsx
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import type { Contact, Signal } from '@/lib/types'
import { SignalBadge } from './SignalBadge'

export function ContactCard({ contact, signals, accountId }: { contact: Contact; signals: Signal[]; accountId: string }) {
  const activeSignals = signals.filter(s => !s.dismissed_at)
  const topSeverity = activeSignals.find(s => s.severity === 'critical')?.severity
    ?? activeSignals.find(s => s.severity === 'warning')?.severity
    ?? (activeSignals.length > 0 ? 'info' as const : null)

  const displayName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unknown'
  const titleChanged = contact.linkedin_current_title && contact.title && contact.linkedin_current_title !== contact.title

  return (
    <Link href={`/accounts/${accountId}/contacts/${contact.id}`} className="block p-3 rounded-lg border border-gray-100 bg-white hover:border-purple-200 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-gray-900 truncate">{displayName}</span>
            {contact.linkedin_url && (
              <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-gray-400 hover:text-blue-600 shrink-0">
                <ExternalLink size={11} />
              </a>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate mt-0.5">{contact.title || '—'}</p>
          {titleChanged && <p className="text-xs text-amber-600 mt-0.5 truncate">LinkedIn: {contact.linkedin_current_title}</p>}
          {contact.point_of_contact_role && <p className="text-xs text-purple-600 font-medium mt-0.5">{contact.point_of_contact_role}</p>}
        </div>
        {topSeverity && <SignalBadge severity={topSeverity} count={activeSignals.length} />}
      </div>
      {contact.data_quality_flag !== 'clean' && (
        <p className="text-xs text-gray-400 mt-1.5 capitalize">{contact.data_quality_flag}</p>
      )}
    </Link>
  )
}
