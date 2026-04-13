// lib/types.ts
export type DataQualityFlag = 'clean' | 'incomplete' | 'junk' | 'duplicate' | 'internal' | 'functional'
export type EnrichmentStatus = 'pending' | 'enriched' | 'unenrichable' | 'skipped'
export type SignalType = 'title_change' | 'left_company' | 'joined_company' | 'new_stakeholder' | 'thought_leader_activity'
export type SignalSeverity = 'critical' | 'warning' | 'info'

export interface Account {
  id: string
  name: string
  normalized_name: string
  website: string | null
  linkedin_company_url: string | null
  industry: string | null
  account_owner: string | null
  account_csm: string | null
  account_stage: string | null
  data_quality_score: number | null
  crm_health_score: number | null
  last_enriched_at: string | null
  created_at: string
}

export interface Contact {
  id: string
  account_id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  title: string | null
  linkedin_url: string | null
  is_relevant_stakeholder: boolean
  is_champion: boolean
  is_contract_signer: boolean
  point_of_contact_role: string | null
  lead_source: string | null
  first_touch_date: string | null
  data_quality_flag: DataQualityFlag
  enrichment_status: EnrichmentStatus
  linkedin_current_title: string | null
  linkedin_current_company: string | null
  last_enriched_at: string | null
  created_at: string
}

export interface Signal {
  id: string
  contact_id: string | null
  account_id: string
  signal_type: SignalType
  severity: SignalSeverity
  summary: string
  old_value: string | null
  new_value: string | null
  source: string
  detected_at: string
  dismissed_at: string | null
}

export interface IndustryIntel {
  id: string
  account_id: string
  industry: string
  trend_summary: string
  sources: { url: string; title: string }[] | null
  generated_at: string
}

// Raw row from Papa Parse after reading the CSV
export interface RawCsvRow {
  'First Touch Campaign Date': string
  'First Name': string
  'Last Name': string
  'LinkedIn URL': string
  'Title': string
  'Account Name': string
  'LinkedIn Company URL': string
  'Account Owner': string
  'Account CSM': string
  'Website Scrubbed': string
  'Email': string
  'Lead Source': string
  'Account Stage': string
  'Contract Signer': string
  'Champion': string
  'Point of Contact': string
}

// Intermediate shape used during ingest (before DB insert)
export interface NormalizedAccount {
  name: string
  normalized_name: string
  website: string
  linkedin_company_url: string
  account_owner: string
  account_csm: string
  account_stage: string
  quarantine: boolean
}

export interface NormalizedContact {
  first_name: string | null
  last_name: string | null
  email: string | null
  title: string | null
  linkedin_url: string | null
  is_champion: boolean
  is_contract_signer: boolean
  is_relevant_stakeholder: boolean
  point_of_contact_role: string
  lead_source: string | null
  first_touch_date: string | null
  data_quality_flag: DataQualityFlag
  enrichment_status: EnrichmentStatus
  account_normalized_name: string
}
