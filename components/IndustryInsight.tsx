// components/IndustryInsight.tsx
import { ExternalLink, TrendingUp } from 'lucide-react'
import type { IndustryIntel } from '@/lib/types'

export function IndustryInsight({ intel }: { intel: IndustryIntel | null }) {
  if (!intel) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-400 text-center">
        Industry intel not yet generated. Trigger enrichment to populate.
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-purple-100 bg-purple-50 p-4 space-y-2">
      <div className="flex items-center gap-2 text-purple-700 font-medium text-sm">
        <TrendingUp size={14} />
        {intel.industry}
      </div>
      <p className="text-sm text-gray-700 leading-relaxed">{intel.trend_summary}</p>
      {intel.sources && intel.sources.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {intel.sources.slice(0, 3).map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-purple-600 hover:underline">
              <ExternalLink size={10} />
              {s.title.slice(0, 40)}{s.title.length > 40 ? '…' : ''}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
