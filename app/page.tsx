// app/page.tsx
export const dynamic = 'force-dynamic'
import { supabaseAdmin } from '@/lib/supabase'
import { AccountCard } from '@/components/AccountCard'
import { CsvUploadWrapper } from '@/components/CsvUploadWrapper'
import type { Account, Contact, Signal } from '@/lib/types'

async function getData() {
  const [accountsRes, contactsRes, signalsRes] = await Promise.all([
    supabaseAdmin.from('accounts').select('*').order('name'),
    supabaseAdmin.from('contacts').select('*'),
    supabaseAdmin.from('signals').select('*').is('dismissed_at', null),
  ])
  return {
    accounts: (accountsRes.data ?? []) as Account[],
    contacts: (contactsRes.data ?? []) as Contact[],
    signals: (signalsRes.data ?? []) as Signal[],
  }
}

export default async function DashboardPage() {
  const { accounts, contacts, signals } = await getData()

  const contactsByAccount = new Map<string, Contact[]>()
  for (const c of contacts) {
    const list = contactsByAccount.get(c.account_id) ?? []
    list.push(c)
    contactsByAccount.set(c.account_id, list)
  }

  const signalsByAccount = new Map<string, Signal[]>()
  for (const s of signals) {
    const list = signalsByAccount.get(s.account_id) ?? []
    list.push(s)
    signalsByAccount.set(s.account_id, list)
  }

  const sorted = [...accounts].sort((a, b) => {
    const aS = signalsByAccount.get(a.id) ?? []
    const bS = signalsByAccount.get(b.id) ?? []
    const score = (s: Signal[]) => s.some(x => x.severity === 'critical') ? 2 : s.some(x => x.severity === 'warning') ? 1 : 0
    return score(bS) - score(aS)
  })

  const totalCritical = signals.filter(s => s.severity === 'critical').length
  const totalWarning = signals.filter(s => s.severity === 'warning').length

  return (
    <div className="p-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Account Intelligence</h1>
          <p className="text-gray-500 text-sm mt-1">
            {accounts.length} accounts
            {totalCritical > 0 && <> · <span className="text-red-600 font-medium">{totalCritical} critical</span></>}
            {totalWarning > 0 && <> · <span className="text-amber-600">{totalWarning} warnings</span></>}
          </p>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="max-w-md mx-auto mt-16">
          <h2 className="text-lg font-semibold text-gray-700 mb-4 text-center">Upload CRM Export to Get Started</h2>
          <CsvUploadWrapper />
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sorted.map(account => (
              <AccountCard
                key={account.id}
                account={account}
                contacts={contactsByAccount.get(account.id) ?? []}
                signals={signalsByAccount.get(account.id) ?? []}
              />
            ))}
          </div>
          <div className="max-w-md">
            <p className="text-sm text-gray-500 mb-2 font-medium">Re-upload to refresh data</p>
            <CsvUploadWrapper />
          </div>
        </div>
      )}
    </div>
  )
}
