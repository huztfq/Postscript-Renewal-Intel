// app/accounts/[id]/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import { StakeholderPanel } from '@/components/StakeholderPanel'
import { IndustryInsight } from '@/components/IndustryInsight'
import { SignalTimeline } from '@/components/SignalTimeline'
import { DataQualityMeter } from '@/components/DataQualityMeter'
import { TrafficLight } from '@/components/SignalBadge'
import type { Account, Contact, Signal, IndustryIntel } from '@/lib/types'
import { Globe, Link2, ChevronLeft } from 'lucide-react'

async function getData(id: string) {
  const [accountRes, contactsRes, signalsRes, intelRes] = await Promise.all([
    supabaseAdmin.from('accounts').select('*').eq('id', id).single(),
    supabaseAdmin.from('contacts').select('*').eq('account_id', id).order('created_at'),
    supabaseAdmin.from('signals').select('*').eq('account_id', id).order('detected_at', { ascending: false }),
    supabaseAdmin.from('industry_intel').select('*').eq('account_id', id).maybeSingle(),
  ])
  return {
    account: accountRes.data as Account | null,
    contacts: (contactsRes.data ?? []) as Contact[],
    signals: (signalsRes.data ?? []) as Signal[],
    intel: intelRes.data as IndustryIntel | null,
  }
}

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { account, contacts, signals, intel } = await getData(id)
  if (!account) notFound()

  const activeSignals = signals.filter(s => !s.dismissed_at)
  const hasCritical = activeSignals.some(s => s.severity === 'critical')
  const hasWarning = activeSignals.some(s => s.severity === 'warning')

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ChevronLeft size={15} /> All Accounts
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <TrafficLight hasCritical={hasCritical} hasWarning={hasWarning} />
            <h1 className="text-2xl font-bold text-gray-900">{account.name}</h1>
            {account.industry && (
              <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full font-medium">{account.industry}</span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            {account.website && (
              <a href={`https://${account.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-gray-700">
                <Globe size={13} />{account.website}
              </a>
            )}
            {account.linkedin_company_url && (
              <a href={account.linkedin_company_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-blue-600">
                <Link2 size={13} />LinkedIn
              </a>
            )}
            <span>CSM: {account.account_csm ?? '—'}</span>
            <span>Owner: {account.account_owner ?? '—'}</span>
            <span className="capitalize">{account.account_stage}</span>
          </div>
        </div>
        <div className="text-right text-sm">
          <div className="font-medium text-gray-700">{contacts.length} contacts</div>
          {activeSignals.length > 0 && (
            <div className={`font-medium ${hasCritical ? 'text-red-600' : 'text-amber-600'}`}>
              {activeSignals.length} active signal{activeSignals.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-8">
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-4">Stakeholders</h2>
            <StakeholderPanel accountId={account.id} contacts={contacts} signals={signals} />
          </section>
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-4">
              Signals {activeSignals.length > 0 && <span className="text-sm font-normal text-gray-500">({activeSignals.length} active)</span>}
            </h2>
            <SignalTimeline signals={signals} />
          </section>
        </div>
        <div className="space-y-6">
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-3">Data Quality</h2>
            <DataQualityMeter contacts={contacts} />
          </section>
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-3">Industry Intel</h2>
            <IndustryInsight intel={intel} />
          </section>
        </div>
      </div>
    </div>
  )
}
