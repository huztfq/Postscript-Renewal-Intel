// lib/cleaning/csv-mapper.ts
// Smart column mapper: normalises any CSV header set → RawCsvRow fields
import type { RawCsvRow } from '@/lib/types'

export type CanonicalField = keyof RawCsvRow

/** Each field's list of recognised header aliases (all lowercase, spaces normalised). */
const FIELD_ALIASES: Record<CanonicalField, string[]> = {
  'First Name':                ['first name', 'first', 'fname', 'firstname', 'given name', 'given_name', 'contact first name'],
  'Last Name':                 ['last name', 'last', 'lname', 'lastname', 'surname', 'family name', 'contact last name'],
  'Email':                     ['email', 'email address', 'e-mail', 'work email', 'contact email', 'email_address'],
  'Title':                     ['title', 'job title', 'position', 'role', 'designation', 'job role', 'job position'],
  'LinkedIn URL':              ['linkedin url', 'linkedin', 'li url', 'linkedin profile', 'profile url', 'linkedin_url', 'li profile', 'linkedin profile url', 'contact linkedin'],
  'Account Name':              ['account name', 'account', 'company', 'company name', 'organization', 'organisation', 'org', 'customer', 'customer name'],
  'LinkedIn Company URL':      ['linkedin company url', 'company linkedin', 'linkedin company', 'company li url', 'linkedin_company_url', 'company linkedin url', 'company profile url'],
  'Account Owner':             ['account owner', 'owner', 'sales rep', 'ae', 'account executive', 'owned by', 'rep', 'sales owner'],
  'Account CSM':               ['account csm', 'csm', 'customer success', 'cs manager', 'success manager', 'csm name', 'success rep'],
  'Website Scrubbed':          ['website', 'website scrubbed', 'domain', 'company website', 'web', 'url', 'site', 'company url', 'homepage'],
  'Lead Source':               ['lead source', 'source', 'acquisition channel', 'channel', 'acquisition source', 'how did you hear'],
  'Account Stage':             ['account stage', 'stage', 'lifecycle stage', 'customer stage', 'crm stage', 'deal stage'],
  'Contract Signer':           ['contract signer', 'signer', 'signed by', 'signatory', 'contract signed by'],
  'Champion':                  ['champion', 'exec sponsor', 'executive sponsor', 'sponsor', 'internal champion'],
  'Point of Contact':          ['point of contact', 'poc', 'contact type', 'relationship', 'contact role', 'poc type'],
  'First Touch Campaign Date': ['first touch campaign date', 'first touch', 'first contact date', 'campaign date', 'date', 'first touch date', 'acquisition date', 'first seen'],
}

/** Required fields — ingest will silently fail without these. */
export const REQUIRED_FIELDS: CanonicalField[] = ['First Name', 'Last Name', 'Account Name']

/** Fields that are useful but optional. */
export const OPTIONAL_FIELDS: CanonicalField[] = [
  'Email', 'Title', 'LinkedIn URL', 'Account Owner', 'Account CSM',
  'LinkedIn Company URL', 'Website Scrubbed', 'Lead Source', 'Account Stage',
  'Contract Signer', 'Champion', 'Point of Contact', 'First Touch Campaign Date',
]

export type ColumnMapping = Record<CanonicalField, string | null>

function normalise(s: string): string {
  return s.toLowerCase().trim().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ')
}

/** Score 0–1 how well an incoming header matches a canonical field. */
function score(incoming: string, field: CanonicalField): number {
  const norm = normalise(incoming)
  const aliases = FIELD_ALIASES[field]
  // Exact match → 1.0
  if (aliases.includes(norm)) return 1.0
  // Contains any alias → 0.8
  for (const a of aliases) if (norm.includes(a) || a.includes(norm)) return 0.8
  // Individual word overlap
  const words = norm.split(' ')
  const best = aliases.reduce((max, a) => {
    const aWords = a.split(' ')
    const shared = words.filter(w => aWords.includes(w)).length
    const ratio = (2 * shared) / (words.length + aWords.length)
    return Math.max(max, ratio)
  }, 0)
  return best * 0.7
}

export interface MappingResult {
  mapping: ColumnMapping
  /** Headers with no confident match (confidence < 0.5) */
  unmapped: string[]
  /** Whether all required fields were found confidently */
  allRequiredFound: boolean
  confidences: Record<CanonicalField, number>
}

export const ALL_FIELDS: CanonicalField[] = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]

export function autoDetectMapping(headers: string[]): MappingResult {
  const mapping = Object.fromEntries(ALL_FIELDS.map(f => [f, null])) as ColumnMapping
  const confidences = Object.fromEntries(ALL_FIELDS.map(f => [f, 0])) as Record<CanonicalField, number>

  // For each canonical field, find the best-scoring header
  for (const field of ALL_FIELDS) {
    let bestHeader: string | null = null
    let bestScore = 0
    for (const h of headers) {
      const s = score(h, field)
      if (s > bestScore) { bestScore = s; bestHeader = h }
    }
    if (bestScore >= 0.5) {
      mapping[field] = bestHeader
      confidences[field] = bestScore
    }
  }

  const unmapped = headers.filter(h => !Object.values(mapping).includes(h))
  const allRequiredFound = REQUIRED_FIELDS.every(f => mapping[f] !== null)

  return { mapping, unmapped, allRequiredFound, confidences }
}

/** Transform raw Papa Parse rows to RawCsvRow using the detected mapping. */
export function applyMapping(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
): RawCsvRow[] {
  return rows.map(row => {
    const out: Record<string, string> = {}
    for (const field of ALL_FIELDS) {
      const srcCol = mapping[field]
      out[field] = srcCol ? (row[srcCol] ?? '') : ''
    }
    return out as unknown as RawCsvRow
  })
}
