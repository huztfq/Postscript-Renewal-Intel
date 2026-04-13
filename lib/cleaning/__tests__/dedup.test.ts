import { describe, it, expect } from 'vitest'
import { deduplicateContacts } from '../dedup'
import type { NormalizedContact } from '@/lib/types'

function contact(overrides: Partial<NormalizedContact> = {}): NormalizedContact {
  return {
    first_name: 'Jane',
    last_name: 'Smith',
    email: 'jane@co.com',
    title: 'VP Marketing',
    linkedin_url: 'https://linkedin.com/in/janesmith',
    is_champion: false,
    is_contract_signer: false,
    is_relevant_stakeholder: true,
    point_of_contact_role: '',
    lead_source: 'Sales Prospecting',
    first_touch_date: '2024-01-01',
    data_quality_flag: 'clean',
    enrichment_status: 'pending',
    account_normalized_name: 'ruggable',
    ...overrides,
  }
}

describe('deduplicateContacts', () => {
  it('returns unique contacts unchanged', () => {
    const contacts = [
      contact({ email: 'a@co.com', linkedin_url: 'https://linkedin.com/in/a' }),
      contact({ email: 'b@co.com', linkedin_url: 'https://linkedin.com/in/b' }),
    ]
    expect(deduplicateContacts(contacts)).toHaveLength(2)
  })

  it('merges contacts with same LinkedIn URL, keeps earliest first_touch_date', () => {
    const contacts = [
      contact({ linkedin_url: 'https://linkedin.com/in/becca', email: 'becca@co.com', first_touch_date: '2022-07-01', title: 'CEO' }),
      contact({ linkedin_url: 'https://linkedin.com/in/becca', email: 'rebecca@gmail.com', first_touch_date: '2023-03-01', title: '' }),
      contact({ linkedin_url: 'https://linkedin.com/in/becca', email: 'becca@co.com', first_touch_date: '2024-01-15', title: 'Co-Founder / CEO' }),
    ]
    const result = deduplicateContacts(contacts)
    expect(result).toHaveLength(1)
    expect(result[0].first_touch_date).toBe('2022-07-01')
  })

  it('merges contacts with same email, keeps most-complete record', () => {
    const contacts = [
      contact({ email: 'hs@dusk.com', linkedin_url: '', title: '' }),
      contact({ email: 'hs@dusk.com', linkedin_url: 'https://linkedin.com/in/haris', title: 'Head of CRM' }),
    ]
    const result = deduplicateContacts(contacts)
    expect(result).toHaveLength(1)
    expect(result[0].linkedin_url).toBe('https://linkedin.com/in/haris')
    expect(result[0].title).toBe('Head of CRM')
  })

  it('does not merge contacts across different accounts', () => {
    const contacts = [
      contact({ email: 'jane@co.com', account_normalized_name: 'ruggable' }),
      contact({ email: 'jane@co.com', account_normalized_name: 'fishwife' }),
    ]
    expect(deduplicateContacts(contacts)).toHaveLength(2)
  })
})
