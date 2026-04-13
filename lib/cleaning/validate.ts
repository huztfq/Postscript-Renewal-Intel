// lib/cleaning/validate.ts
import type { DataQualityFlag, RawCsvRow } from '@/lib/types'

const INTERNAL_DOMAINS = new Set(['postscript.io'])

const FUNCTIONAL_PREFIXES = new Set([
  'help', 'hello', 'accounting', 'shopify', 'cx-leaders',
  'us.help', 'rhodeadmin',
])

const JUNK_FIRST_NAMES = new Set([
  '', 'n/a', 'na', 'help', 'ef', 'cx', 'accounting', 'hello',
  'placeholder', 'unknown',
])

const JUNK_LAST_NAMES = new Set([
  '[not provided]', '[not_provided]', 'unknown', 'placeholder',
  'n/a', 'na', 'us', 'dusk', 'rhode',
])

function isSingleInitial(name: string): boolean {
  return name.trim().length === 1
}

export function flagContact(row: RawCsvRow): DataQualityFlag {
  const firstName = (row['First Name'] ?? '').trim()
  const lastName = (row['Last Name'] ?? '').trim()
  const email = (row['Email'] ?? '').trim().toLowerCase()
  const title = (row['Title'] ?? '').trim()
  const linkedinUrl = (row['LinkedIn URL'] ?? '').trim()

  const emailParts = email.split('@')
  const emailPrefix = emailParts[0] ?? ''
  const emailDomain = emailParts[1] ?? ''

  if (INTERNAL_DOMAINS.has(emailDomain)) return 'internal'
  if (FUNCTIONAL_PREFIXES.has(emailPrefix)) return 'functional'

  const firstLower = firstName.toLowerCase()
  const lastLower = lastName.toLowerCase()

  if (
    JUNK_FIRST_NAMES.has(firstLower) ||
    JUNK_LAST_NAMES.has(lastLower) ||
    isSingleInitial(firstName)
  ) return 'junk'

  if (!title && !linkedinUrl) return 'incomplete'

  return 'clean'
}

export const RELEVANT_TITLE_KEYWORDS = [
  'retention', 'crm', 'email', 'sms', 'lifecycle', 'loyalty',
  'ecommerce', 'growth', 'digital', 'marketing',
]

export function isRelevantStakeholder(title: string): boolean {
  const lower = title.toLowerCase()
  return RELEVANT_TITLE_KEYWORDS.some(kw => lower.includes(kw))
}
