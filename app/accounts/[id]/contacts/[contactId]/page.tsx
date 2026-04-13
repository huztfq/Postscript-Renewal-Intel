// app/accounts/[id]/contacts/[contactId]/page.tsx
export const dynamic = 'force-dynamic'
import { unstable_noStore as noStore } from 'next/cache'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import { SignalTimeline } from '@/components/SignalTimeline'
import type { Contact, Signal } from '@/lib/types'
import { ChevronLeft, ExternalLink, Mail } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

async function getData(contactId: string) {
  noStore()
  const [contactRes, signalsRes] = await Promise.all([
    supabaseAdmin.from('contacts').select('*').eq('id', contactId).single(),
    supabaseAdmin.from('signals').select('*').eq('contact_id', contactId).order('detected_at', { ascending: false }),
  ])
  return {
    contact: contactRes.data as Contact | null,
    signals: (signalsRes.data ?? []) as Signal[],
  }
}

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string; contactId: string }> }) {
  const { id, contactId } = await params
  const { contact, signals } = await getData(contactId)
  if (!contact) notFound()

  const displayName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unknown'
  const titleMismatch = contact.linkedin_current_title && contact.title && contact.linkedin_current_title !== contact.title

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <Link href={`/accounts/${id}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ChevronLeft size={15} /> Back to Account
      </Link>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{displayName}</h1>
            <p className="text-gray-600 text-sm mt-0.5">{contact.title || 'No title in CRM'}</p>
            {titleMismatch && <p className="text-amber-600 text-sm mt-1">LinkedIn title: {contact.linkedin_current_title}</p>}
            {contact.point_of_contact_role && <p className="text-purple-700 text-sm font-medium mt-1">{contact.point_of_contact_role}</p>}
          </div>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
            contact.data_quality_flag === 'clean' ? 'bg-emerald-50 text-emerald-700' :
            contact.data_quality_flag === 'incomplete' ? 'bg-gray-100 text-gray-600' :
            'bg-red-50 text-red-600'}`}>
            {contact.data_quality_flag}
          </span>
        </div>

        <div className="space-y-2 text-sm">
          {contact.email && (
            <div className="flex items-center gap-2 text-gray-600">
              <Mail size={13} />
              <a href={`mailto:${contact.email}`} className="hover:text-gray-900">{contact.email}</a>
            </div>
          )}
          {contact.linkedin_url && (
            <div className="flex items-center gap-2 text-gray-600">
              <ExternalLink size={13} />
              <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600">LinkedIn Profile</a>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-4 text-xs text-gray-500">
          <div><div className="font-medium text-gray-700">Enrichment</div><div className="capitalize">{contact.enrichment_status}</div></div>
          <div><div className="font-medium text-gray-700">Lead Source</div><div>{contact.lead_source ?? '—'}</div></div>
          <div><div className="font-medium text-gray-700">First Touch</div><div>{contact.first_touch_date ?? '—'}</div></div>
        </div>
        {contact.last_enriched_at && (
          <p className="text-xs text-gray-400 mt-3">
            Last enriched {formatDistanceToNow(new Date(contact.last_enriched_at), { addSuffix: true })}
          </p>
        )}
      </div>

      <h2 className="text-base font-semibold text-gray-800 mb-3">Signal History</h2>
      <SignalTimeline signals={signals} />
    </div>
  )
}
