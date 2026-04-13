CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  website TEXT,
  linkedin_company_url TEXT,
  industry TEXT,
  account_owner TEXT,
  account_csm TEXT,
  account_stage TEXT,
  data_quality_score FLOAT DEFAULT 0,
  crm_health_score FLOAT DEFAULT 0,
  last_enriched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  title TEXT,
  linkedin_url TEXT,
  is_relevant_stakeholder BOOLEAN DEFAULT FALSE,
  is_champion BOOLEAN DEFAULT FALSE,
  is_contract_signer BOOLEAN DEFAULT FALSE,
  point_of_contact_role TEXT,
  lead_source TEXT,
  first_touch_date DATE,
  data_quality_flag TEXT NOT NULL DEFAULT 'incomplete',
  enrichment_status TEXT NOT NULL DEFAULT 'pending',
  linkedin_current_title TEXT,
  linkedin_current_company TEXT,
  last_enriched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  signal_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  summary TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  source TEXT,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  dismissed_at TIMESTAMPTZ
);

CREATE TABLE industry_intel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE UNIQUE,
  industry TEXT NOT NULL,
  trend_summary TEXT NOT NULL,
  sources JSONB,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE thought_leaders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  platform TEXT,
  follower_count INTEGER,
  recent_topics TEXT[],
  activity_summary TEXT,
  last_checked_at TIMESTAMPTZ
);

-- Enable Realtime on signals table
ALTER TABLE signals REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE signals;
