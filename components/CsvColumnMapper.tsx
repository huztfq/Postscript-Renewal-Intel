'use client'
// components/CsvColumnMapper.tsx
import { useState } from 'react'
import { ALL_FIELDS, REQUIRED_FIELDS, type CanonicalField, type ColumnMapping } from '@/lib/cleaning/csv-mapper'
import { CheckCircle, AlertCircle, ChevronDown } from 'lucide-react'

interface Props {
  headers: string[]
  initialMapping: ColumnMapping
  sampleRows: Record<string, string>[]
  onConfirm: (mapping: ColumnMapping) => void
  onCancel: () => void
}

export function CsvColumnMapper({ headers, initialMapping, sampleRows, onConfirm, onCancel }: Props) {
  const [mapping, setMapping] = useState<ColumnMapping>({ ...initialMapping })

  const missingRequired = REQUIRED_FIELDS.filter(f => !mapping[f])
  const mappedCount = (Object.values(mapping) as (string | null)[]).filter(Boolean).length
  const usedHeaders = new Set(Object.values(mapping).filter(Boolean))

  function setField(field: CanonicalField, header: string | null) {
    setMapping(prev => {
      // Clear any other field that was using this header
      const cleared = Object.fromEntries(
        Object.entries(prev).map(([k, v]) => [k, v === header ? null : v])
      ) as ColumnMapping
      return { ...cleared, [field]: header }
    })
  }

  const sampleData = sampleRows.slice(0, 2)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Map CSV Columns</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            We auto-detected {mappedCount} of {ALL_FIELDS.length} fields. Review and adjust if needed.
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
          {/* Required fields first */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Required</p>
          {REQUIRED_FIELDS.map(field => (
            <FieldRow
              key={field}
              field={field}
              value={mapping[field]}
              headers={headers}
              usedHeaders={usedHeaders}
              sampleData={sampleData}
              required
              onChange={h => setField(field, h)}
            />
          ))}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-4 mb-2">Optional</p>
          {ALL_FIELDS.filter(f => !REQUIRED_FIELDS.includes(f)).map(field => (
            <FieldRow
              key={field}
              field={field}
              value={mapping[field]}
              headers={headers}
              usedHeaders={usedHeaders}
              sampleData={sampleData}
              required={false}
              onChange={h => setField(field, h)}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          {missingRequired.length > 0 ? (
            <span className="text-sm text-red-600 flex items-center gap-1.5">
              <AlertCircle size={14} />
              Missing required: {missingRequired.join(', ')}
            </span>
          ) : (
            <span className="text-sm text-emerald-600 flex items-center gap-1.5">
              <CheckCircle size={14} />
              All required fields mapped
            </span>
          )}
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={missingRequired.length > 0}
              onClick={() => onConfirm(mapping)}
              className="px-4 py-2 text-sm rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Import {mappedCount} fields →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FieldRow({
  field, value, headers, usedHeaders, sampleData, required, onChange,
}: {
  field: CanonicalField
  value: string | null
  headers: string[]
  usedHeaders: Set<string | null>
  sampleData: Record<string, string>[]
  required: boolean
  onChange: (h: string | null) => void
}) {
  const isMapped = Boolean(value)
  const sample = value ? sampleData.map(r => r[value]).filter(Boolean).slice(0, 2).join(', ') : null

  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${isMapped ? 'bg-gray-50' : required ? 'bg-red-50' : 'bg-white'}`}>
      <div className="w-44 shrink-0">
        <span className="text-sm font-medium text-gray-700">{field}</span>
        {required && !isMapped && <span className="ml-1 text-xs text-red-500">*</span>}
      </div>

      <div className="relative flex-1">
        <select
          value={value ?? ''}
          onChange={e => onChange(e.target.value || null)}
          className="w-full appearance-none pl-3 pr-8 py-1.5 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
        >
          <option value="">— not mapped —</option>
          {headers.map(h => (
            <option key={h} value={h} disabled={usedHeaders.has(h) && h !== value}>
              {h}{usedHeaders.has(h) && h !== value ? ' (used)' : ''}
            </option>
          ))}
        </select>
        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>

      <div className="w-36 shrink-0">
        {sample ? (
          <span className="text-xs text-gray-400 truncate block" title={sample}>{sample}</span>
        ) : (
          <span className="text-xs text-gray-300 italic">no preview</span>
        )}
      </div>
    </div>
  )
}

// Re-export so CsvUpload can import from one place
export { ALL_FIELDS }
