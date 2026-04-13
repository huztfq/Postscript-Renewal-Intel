// app/signals/page.tsx
import { supabaseAdmin } from '@/lib/supabase'
import { SignalBadge } from '@/components/SignalBadge'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import type { Signal, Account } from '@/lib/types'
import { Zap } from 'lucide-react'

async function getData() {
  const [signalsRes, accountsRes] = await Promise.all([
    supabaseAdmin
      .from('signals')
      .select('*')
      .is('dismissed_at', null)
      .order('detected_at', { ascending: false }),
    supabaseAdmin.from('accounts').select('id, name'),
  ])
  return {
    signals: (signalsRes.data ?? []) as Signal[],
    accounts: (accountsRes.data ?? []) as Pick<Account, 'id' | 'name'>[],
  }
}

export default async function SignalsPage() {
  const { signals, accounts } = await getData()

  const accountName = new Map(accounts.map(a => [a.id, a.name]))

  const critical = signals.filter(s => s.severity === 'critical')
  const warning = signals.filter(s => s.severity === 'warning')
  const info = signals.filter(s => s.severity === 'info')

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Zap size={22} className="text-purple-500" />
          Signals
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {signals.length} active signal{signals.length !== 1 ? 's' : ''}
          {critical.length > 0 && <> · <span className="text-red-600 font-medium">{critical.length} critical</span></>}
          {warning.length > 0 && <> · <span className="text-amber-600">{warning.length} warnings</span></>}
          {info.length > 0 && <> · <span className="text-gray-500">{info.length} info</span></>}
        </p>
      </div>

      {signals.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Zap size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No active signals. Upload a CSV and run enrichment to detect changes.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {signals.map(signal => (
            <Link
              key={signal.id}
              href={`/accounts/${signal.account_id}`}
              className="flex items-start gap-3 p-4 rounded-xl bg-white border border-gray-100 hover:border-purple-200 hover:shadow-sm transition-all"
            >
              <SignalBadge severity={signal.severity} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800">{signal.summary}</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                  <span className="font-medium text-gray-600">{accountName.get(signal.account_id) ?? '—'}</span>
                  <span>·</span>
                  <span>{formatDistanceToNow(new Date(signal.detected_at), { addSuffix: true })}</span>
                  <span>·</span>
                  <span>{signal.source}</span>
                </div>
              </div>
              <span className="text-xs text-gray-400 capitalize shrink-0">{signal.signal_type.replace(/_/g, ' ')}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
