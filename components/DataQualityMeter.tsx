// components/DataQualityMeter.tsx
import type { Contact } from '@/lib/types'

function countFlags(contacts: Contact[]) {
  const counts: Record<string, number> = {}
  for (const c of contacts) {
    counts[c.data_quality_flag] = (counts[c.data_quality_flag] ?? 0) + 1
  }
  return counts
}

export function DataQualityMeter({ contacts }: { contacts: Contact[] }) {
  const total = contacts.length
  const counts = countFlags(contacts)
  const cleanPct = total > 0 ? Math.round(((counts.clean ?? 0) / total) * 100) : 0

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>CRM Data Quality</span>
        <span className="font-medium text-gray-700">{cleanPct}% clean</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${cleanPct}%` }} />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400">
        {Object.entries(counts).filter(([, v]) => v > 0).map(([flag, count]) => (
          <span key={flag}><span className="text-gray-600 font-medium">{count}</span> {flag}</span>
        ))}
      </div>
    </div>
  )
}
