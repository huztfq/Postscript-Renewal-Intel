// components/AccountCard.tsx
import Link from 'next/link'
import { Globe } from 'lucide-react'
import type { Account, Signal, Contact } from '@/lib/types'
import { TrafficLight } from './SignalBadge'
import { DataQualityMeter } from './DataQualityMeter'

export function AccountCard({ account, contacts, signals }: { account: Account; contacts: Contact[]; signals: Signal[] }) {
  const activeSignals = signals.filter(s => !s.dismissed_at)
  const hasCritical = activeSignals.some(s => s.severity === 'critical')
  const hasWarning = activeSignals.some(s => s.severity === 'warning')

  return (
    <Link href={`/accounts/${account.id}`} className="block">
      <div className="bg-white rounded-xl border border-gray-200 p-5 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <TrafficLight hasCritical={hasCritical} hasWarning={hasWarning} />
              <h2 className="text-base font-semibold text-gray-900">{account.name}</h2>
            </div>
            {account.industry && (
              <span className="inline-block mt-1 px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full font-medium">
                {account.industry}
              </span>
            )}
          </div>
          <div className="text-right text-xs text-gray-400">
            <div>{account.account_csm ?? '—'}</div>
            <div className="text-gray-300">{account.account_stage}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
          {account.website && (
            <span className="flex items-center gap-1"><Globe size={11} />{account.website}</span>
          )}
          <span>{contacts.length} contacts</span>
          {activeSignals.length > 0 && (
            <span className={hasCritical ? 'text-red-600 font-medium' : hasWarning ? 'text-amber-600' : 'text-emerald-600'}>
              {activeSignals.length} signal{activeSignals.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <DataQualityMeter contacts={contacts} />
      </div>
    </Link>
  )
}
