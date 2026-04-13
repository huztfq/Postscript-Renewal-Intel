// components/CsvUploadWrapper.tsx
'use client'
import { CsvUpload } from './CsvUpload'

export function CsvUploadWrapper() {
  return (
    <CsvUpload onComplete={() => { window.location.reload() }} />
  )
}
