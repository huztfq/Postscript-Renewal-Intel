// components/SignalBadge.tsx
import type { SignalSeverity } from '@/lib/types'

const config: Record<SignalSeverity, { bg: string; text: string; dot: string; label: string }> = {
  critical: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', label: 'Critical' },
  warning:  { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', label: 'Warning' },
  info:     { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Info' },
}

export function SignalBadge({ severity, count }: { severity: SignalSeverity; count?: number }) {
  const c = config[severity]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}{count !== undefined ? ` (${count})` : ''}
    </span>
  )
}

export function TrafficLight({ hasCritical, hasWarning }: { hasCritical: boolean; hasWarning: boolean }) {
  if (hasCritical) return <span className="w-3 h-3 rounded-full bg-red-500 inline-block" title="Critical signals" />
  if (hasWarning) return <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" title="Warnings" />
  return <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" title="No alerts" />
}
