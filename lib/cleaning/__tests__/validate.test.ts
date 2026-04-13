import { describe, it, expect } from 'vitest'
import { flagContact } from '../validate'
import type { RawCsvRow } from '@/lib/types'

function row(overrides: Partial<RawCsvRow> = {}): RawCsvRow {
  return {
    'First Touch Campaign Date': '',
    'First Name': 'Jane',
    'Last Name': 'Smith',
    'LinkedIn URL': 'https://linkedin.com/in/janesmith',
    'Title': 'VP of Marketing',
    'Account Name': 'Ruggable',
    'LinkedIn Company URL': '',
    'Account Owner': 'Dan Dravis',
    'Account CSM': 'Simone Vermette',
    'Website Scrubbed': 'shop.ruggable.com',
    'Email': 'jane@ruggable.com',
    'Lead Source': 'Sales Prospecting',
    'Account Stage': 'Customer',
    'Contract Signer': '',
    'Champion': '',
    'Point of Contact': '',
    ...overrides,
  }
}

describe('flagContact', () => {
  it('returns clean for a complete, real contact', () => {
    expect(flagContact(row())).toBe('clean')
  })

  it('flags internal for @postscript.io email', () => {
    expect(flagContact(row({ Email: 'aaron.fox@postscript.io' }))).toBe('internal')
  })

  it('flags functional for help@ email', () => {
    expect(flagContact(row({ Email: 'help@dusk.com' }))).toBe('functional')
  })

  it('flags functional for accounting@ email', () => {
    expect(flagContact(row({ Email: 'accounting@rhodeskin.com' }))).toBe('functional')
  })

  it('flags functional for cx-leaders@ email', () => {
    expect(flagContact(row({ Email: 'cx-leaders@thrivecausemetics.com' }))).toBe('functional')
  })

  it('flags junk for [not provided] last name', () => {
    expect(flagContact(row({ 'First Name': '', 'Last Name': '[not provided]' }))).toBe('junk')
  })

  it('flags junk for Help first name', () => {
    expect(flagContact(row({ 'First Name': 'Help', 'Last Name': 'US' }))).toBe('junk')
  })

  it('flags junk for single letter first name', () => {
    expect(flagContact(row({ 'First Name': 'E', 'Last Name': 'Ellis' }))).toBe('junk')
  })

  it('flags junk for n/a name', () => {
    expect(flagContact(row({ 'First Name': 'n/a', 'Last Name': 'n/a' }))).toBe('junk')
  })

  it('flags junk for Placeholder last name', () => {
    expect(flagContact(row({ 'First Name': '', 'Last Name': 'Placeholder' }))).toBe('junk')
  })

  it('flags incomplete for real name with no title and no LinkedIn', () => {
    expect(flagContact(row({ Title: '', 'LinkedIn URL': '' }))).toBe('incomplete')
  })

  it('returns clean if has name + title even without LinkedIn', () => {
    expect(flagContact(row({ 'LinkedIn URL': '' }))).toBe('clean')
  })

  it('returns clean if has name + LinkedIn even without title', () => {
    expect(flagContact(row({ Title: '' }))).toBe('clean')
  })
})
