// lib/cleaning/normalize.ts
import type { NormalizedAccount, RawCsvRow } from '@/lib/types'

interface AccountDefinition {
  name: string
  normalized_name: string
  quarantine?: boolean
}

const WEBSITE_TO_ACCOUNT: Record<string, AccountDefinition> = {
  'dusk.com':              { name: 'DUSK',               normalized_name: 'dusk' },
  'duskofficial.com':      { name: 'DUSK',               normalized_name: 'dusk' },
  'rhodeskin.com':         { name: 'rhode skin',         normalized_name: 'rhode-skin' },
  'shoprhode.com':         { name: 'Rhode Resort',       normalized_name: 'rhode-resort' },
  'rhode.pro':             { name: 'Rhode (Unknown)',    normalized_name: 'rhode-unknown', quarantine: true },
  'eatfishwife.com':       { name: 'Fishwife',           normalized_name: 'fishwife' },
  'shop.ruggable.com':     { name: 'Ruggable',           normalized_name: 'ruggable' },
  'thrivecausemetics.com': { name: 'Thrive Causemetics', normalized_name: 'thrive-causemetics' },
}

export function resolveAccount(
  rawName: string,
  website: string,
  linkedinCompanyUrl: string,
  accountOwner: string,
  accountCsm: string,
  accountStage: string,
): NormalizedAccount {
  const def = WEBSITE_TO_ACCOUNT[website.trim().toLowerCase()]

  if (!def) {
    const normalized_name = rawName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    return {
      name: rawName.trim(),
      normalized_name,
      website: website.trim(),
      linkedin_company_url: linkedinCompanyUrl.trim(),
      account_owner: accountOwner.trim(),
      account_csm: accountCsm.trim(),
      account_stage: accountStage.trim(),
      quarantine: false,
    }
  }

  return {
    name: def.name,
    normalized_name: def.normalized_name,
    website: website.trim(),
    linkedin_company_url: linkedinCompanyUrl.trim(),
    account_owner: accountOwner.trim(),
    account_csm: accountCsm.trim(),
    account_stage: accountStage.trim(),
    quarantine: def.quarantine ?? false,
  }
}

export function resolveAccountFromRow(row: RawCsvRow): NormalizedAccount {
  return resolveAccount(
    row['Account Name'],
    row['Website Scrubbed'],
    row['LinkedIn Company URL'],
    row['Account Owner'],
    row['Account CSM'],
    row['Account Stage'],
  )
}
