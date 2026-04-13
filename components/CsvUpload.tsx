// components/CsvUpload.tsx
'use client'
import { useState, useRef } from 'react'
import Papa from 'papaparse'
import { toast } from 'sonner'
import { autoDetectMapping, applyMapping, REQUIRED_FIELDS, type ColumnMapping } from '@/lib/cleaning/csv-mapper'
import { CsvColumnMapper } from './CsvColumnMapper'
import type { RawCsvRow } from '@/lib/types'
import { Upload, Loader2, CheckCircle } from 'lucide-react'

type Status = 'idle' | 'parsing' | 'mapping' | 'ingesting' | 'enriching' | 'done'

interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
}

export function CsvUpload({ onComplete }: { onComplete: () => void }) {
  const [status, setStatus] = useState<Status>('idle')
  const [stats, setStats] = useState<{ accounts: number; contacts: number } | null>(null)
  const [parsed, setParsed] = useState<ParsedCsv | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setStatus('parsing')
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = result.meta.fields ?? []
        const rows = result.data
        const detected = autoDetectMapping(headers)

        // All required fields confident? Skip the mapping UI
        const allConfident = REQUIRED_FIELDS.every(f => detected.mapping[f] !== null)
        if (allConfident) {
          const mapped = Object.values(detected.confidences).filter(c => c > 0).length
          toast.info(`Auto-mapped ${mapped} columns`, { duration: 3000 })
          runIngest(rows, detected.mapping)
        } else {
          setParsed({ headers, rows })
          setMapping(detected.mapping)
          setStatus('mapping')
        }
      },
      error: (err) => {
        toast.error(`CSV parse error: ${err.message}`, { duration: 8000 })
        setStatus('idle')
      },
    })
  }

  async function runIngest(rows: Record<string, string>[], finalMapping: ColumnMapping) {
    const loadingId = toast.loading('Cleaning and storing contacts…')
    setStatus('ingesting')
    try {
      const mapped: RawCsvRow[] = applyMapping(rows, finalMapping)
      const ingestRes = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: mapped }),
      })
      if (!ingestRes.ok) {
        const err = await ingestRes.json()
        throw new Error(err.error ?? 'Ingest failed')
      }
      const { accountIds, stats } = await ingestRes.json()
      setStats(stats)

      toast.loading('Queuing enrichment jobs…', { id: loadingId })
      setStatus('enriching')
      const enrichRes = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountIds }),
      })
      if (!enrichRes.ok) {
        const err = await enrichRes.json().catch(() => ({}))
        toast.warning(`Ingest done, enrichment failed: ${err.error ?? 'unknown'}`, { id: loadingId, duration: 8000 })
      } else {
        toast.success(
          `${stats.accounts} accounts · ${stats.contacts} contacts ingested. Enrichment running in background.`,
          { id: loadingId, duration: 6000 },
        )
      }
      setStatus('done')
      onComplete()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong', { id: loadingId, duration: 10000 })
      setStatus('idle')
    }
  }

  function handleMappingConfirm(confirmedMapping: ColumnMapping) {
    if (!parsed) return
    setStatus('ingesting')
    runIngest(parsed.rows, confirmedMapping)
  }

  const isLoading = ['parsing', 'ingesting', 'enriching'].includes(status)

  return (
    <>
      <div
        className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-purple-300 hover:bg-purple-50/50 transition-colors"
        onClick={() => !isLoading && status !== 'mapping' && inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f && !isLoading && status !== 'mapping') handleFile(f)
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        {isLoading && <Loader2 className="mx-auto mb-2 text-purple-500 animate-spin" size={24} />}
        {status === 'done' && <CheckCircle className="mx-auto mb-2 text-emerald-500" size={24} />}
        {!isLoading && status !== 'done' && <Upload className="mx-auto mb-2 text-gray-300" size={24} />}
        <p className={`text-sm ${status === 'done' ? 'text-emerald-600 font-medium' : 'text-gray-500'}`}>
          {status === 'idle' && 'Drop CSV here or click to upload'}
          {status === 'parsing' && 'Parsing CSV…'}
          {status === 'mapping' && 'Review column mapping…'}
          {status === 'ingesting' && 'Cleaning and storing contacts…'}
          {status === 'enriching' && 'Queuing enrichment jobs…'}
          {status === 'done' && `Done! ${stats?.accounts} accounts, ${stats?.contacts} contacts.`}
        </p>
      </div>

      {status === 'mapping' && parsed && mapping && (
        <CsvColumnMapper
          headers={parsed.headers}
          initialMapping={mapping}
          sampleRows={parsed.rows}
          onConfirm={handleMappingConfirm}
          onCancel={() => { setStatus('idle'); setParsed(null); setMapping(null) }}
        />
      )}
    </>
  )
}
