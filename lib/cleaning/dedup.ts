// lib/cleaning/dedup.ts
import type { NormalizedContact } from '@/lib/types'

function completenessScore(c: NormalizedContact): number {
  let score = 0
  if (c.first_name) score++
  if (c.last_name) score++
  if (c.email) score++
  if (c.title) score++
  if (c.linkedin_url) score++
  if (c.point_of_contact_role) score++
  return score
}

function mergeContacts(contacts: NormalizedContact[]): NormalizedContact {
  const sorted = [...contacts].sort((a, b) => {
    const scoreDiff = completenessScore(b) - completenessScore(a)
    if (scoreDiff !== 0) return scoreDiff
    if (a.first_touch_date && b.first_touch_date) {
      return a.first_touch_date.localeCompare(b.first_touch_date)
    }
    return 0
  })

  const base = sorted[0]

  const touchDates = contacts.map(c => c.first_touch_date).filter(Boolean) as string[]
  const earliestDate = touchDates.length > 0 ? touchDates.sort()[0] : null

  const is_champion = contacts.some(c => c.is_champion)
  const is_contract_signer = contacts.some(c => c.is_contract_signer)
  const is_relevant_stakeholder = contacts.some(c => c.is_relevant_stakeholder)

  const roles = Array.from(new Set(contacts.map(c => c.point_of_contact_role).filter(Boolean)))
  const point_of_contact_role = roles.join('; ')

  return {
    ...base,
    first_touch_date: earliestDate,
    is_champion,
    is_contract_signer,
    is_relevant_stakeholder,
    point_of_contact_role,
  }
}

function normalizeLinkedin(url: string): string {
  return url.toLowerCase().replace(/\?.*$/, '').replace(/\/$/, '')
}

export function deduplicateContacts(contacts: NormalizedContact[]): NormalizedContact[] {
  // Union-Find approach: merge contacts that share linkedin_url OR email within same account
  const parent = contacts.map((_, i) => i)

  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }

  function union(a: number, b: number): void {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  // Build lookup maps per account for linkedin and email
  const liIndex = new Map<string, number>()
  const emailIndex = new Map<string, number>()

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i]
    const account = c.account_normalized_name

    if (c.linkedin_url) {
      const liKey = `${account}::li::${normalizeLinkedin(c.linkedin_url)}`
      if (liIndex.has(liKey)) {
        union(i, liIndex.get(liKey)!)
      } else {
        liIndex.set(liKey, i)
      }
    }

    if (c.email) {
      const emailKey = `${account}::email::${c.email.toLowerCase()}`
      if (emailIndex.has(emailKey)) {
        union(i, emailIndex.get(emailKey)!)
      } else {
        emailIndex.set(emailKey, i)
      }
    }
  }

  // Group contacts by their root
  const groups = new Map<number, NormalizedContact[]>()
  for (let i = 0; i < contacts.length; i++) {
    const root = find(i)
    const group = groups.get(root) ?? []
    group.push(contacts[i])
    groups.set(root, group)
  }

  return Array.from(groups.values()).map(group =>
    group.length === 1 ? group[0] : mergeContacts(group)
  )
}
