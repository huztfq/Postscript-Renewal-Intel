// components/SignalTimeline.tsx
'use client'
import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import type { Signal } from '@/lib/types'
import { SignalBadge } from './SignalBadge'
import { X } from 'lucide-react'

export function SignalTimeline({ signals: initial }: { signals: Signal[] }) {
  const [signals, setSignals] = useState(initial)
  const active = signals.filter(s => !s.dismissed_at)

  async function dismiss(signalId: string) {
    await fetch(`/api/signals/${signalId}`, { method: 'PATCH' })
    setSignals(prev => prev.map(s => s.id === signalId ? { ...s, dismissed_at: new Date().toISOString() } : s))
  }

  if (active.length === 0) return <p className="text-sm text-gray-400">No active signals.</p>

  return (
    <div className="space-y-2">
      {active
        .sort((a, b) => ({ critical: 0, warning: 1, info: 2 }[a.severity] ?? 2) - ({ critical: 0, warning: 1, info: 2 }[b.severity] ?? 2))
        .map(signal => (
          <div key={signal.id} className="flex items-start gap-3 p-3 rounded-lg bg-white border border-gray-100">
            <SignalBadge severity={signal.severity} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800">{signal.summary}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatDistanceToNow(new Date(signal.detected_at), { addSuffix: true })} · {signal.source}
              </p>
            </div>
            <button onClick={() => dismiss(signal.id)} className="text-gray-300 hover:text-gray-500 shrink-0 mt-0.5" title="Dismiss">
              <X size={14} />
            </button>
          </div>
        ))}
    </div>
  )
}
