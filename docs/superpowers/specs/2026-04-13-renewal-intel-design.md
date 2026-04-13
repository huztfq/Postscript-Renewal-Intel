# Postscript GTM — Renewal Intelligence Tool
**Date:** 2026-04-13  
**Status:** Approved

---

## 1. Purpose

A real-time web app for Customer Success Managers preparing for renewals. It ingests a messy CRM contact export, cleans and enriches it, and surfaces stakeholder turnover signals and account health indicators — so CSMs know who left, who changed roles, and who they're missing before walking into a renewal call.

---

## 2. Architecture

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Next.js 14 App Router + Tailwind + shadcn/ui | SSR, fast DX, deploys free to Vercel |
| Database | Supabase (Postgres) | Free tier, Realtime subscriptions, row-level security |
| Background jobs | Inngest | Step functions, retry/rate-limit handling, 50k runs/month free, great local dev |
| Enrichment - LinkedIn | Proxycurl API | Cleanest LinkedIn data source; person profile + company employees endpoints |
| Enrichment - Web | Tavily API | Web search for news and thought leader activity |
| Enrichment - AI | OpenAI API (GPT-4o-mini) | Industry classification, trend summaries, signal summarization |
| Hosting | Vercel (frontend) + Supabase (DB) | Both free tiers sufficient for demo |

Realtime flow: Inngest job completes → writes signal to Supabase → Supabase Realtime subscription → UI updates without page refresh.

---

## 3. Data Model

```sql
-- Accounts (normalized from CSV Account Name + Website)
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  website TEXT,
  linkedin_company_url TEXT,
  industry TEXT,
  account_owner TEXT,
  account_csm TEXT,
  account_stage TEXT,
  data_quality_score FLOAT,        -- 0-1, % of contacts flagged "clean"
  crm_health_score FLOAT,          -- 0-1, composite: clean contacts + signal recency
  last_enriched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contacts (cleaned from CSV rows)
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id),
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  title TEXT,
  linkedin_url TEXT,
  is_relevant_stakeholder BOOLEAN DEFAULT FALSE,
  is_champion BOOLEAN DEFAULT FALSE,
  is_contract_signer BOOLEAN DEFAULT FALSE,
  point_of_contact_role TEXT,      -- "Main POC", "Legal POC", "Executive Decision Maker"
  lead_source TEXT,
  first_touch_date DATE,
  data_quality_flag TEXT,          -- "clean" | "incomplete" | "junk" | "duplicate" | "internal" | "functional"
  enrichment_status TEXT DEFAULT 'pending', -- "pending" | "enriched" | "unenrichable" | "skipped"
  linkedin_current_title TEXT,     -- from Proxycurl
  linkedin_current_company TEXT,   -- from Proxycurl
  last_enriched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stakeholder change signals
CREATE TABLE signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id),
  account_id UUID REFERENCES accounts(id),
  signal_type TEXT NOT NULL,
    -- 'title_change' | 'left_company' | 'joined_company'
    -- 'new_stakeholder' | 'thought_leader_activity'
  severity TEXT DEFAULT 'info',    -- 'critical' | 'warning' | 'info'
  summary TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  source TEXT,                     -- 'proxycurl' | 'tavily' | 'openai'
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  dismissed_at TIMESTAMPTZ
);

-- Industry intelligence
CREATE TABLE industry_intel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id),
  industry TEXT NOT NULL,
  trend_summary TEXT NOT NULL,
  sources JSONB,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Thought leader activity
CREATE TABLE thought_leaders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id),
  platform TEXT,
  follower_count INTEGER,
  recent_topics TEXT[],
  activity_summary TEXT,
  last_checked_at TIMESTAMPTZ
);
```

---

## 4. Data Cleaning Rules

### Account Normalization
| Issue | Decision | Reason |
|---|---|---|
| DUSK on `dusk.com` + `duskofficial.com` | Merge into one account | Same company, overlapping contacts, same CSM |
| `rhodeskin.com` (rhode skin brand) | Separate account: "rhode skin" | Different LinkedIn URL, industry (beauty), CSM |
| `shoprhode.com` (Rhode resort) | Separate account: "Rhode Resort" | Different industry (hospitality), contacts, owner |
| `rhode.pro` (1 placeholder row) | Quarantine | Single junk row, no real contacts |

### Contact Quality Flags
| Flag | Criteria |
|---|---|
| `junk` | First name is: blank, `n/a`, `Help`, `EF`, `CX`, `Accounting`, `Hello`, single letter initial; OR last name is `[not provided]`, `Unknown`, `Placeholder`, `N/A` |
| `internal` | Email domain is `@postscript.io` |
| `functional` | Email prefix is `help`, `hello`, `accounting`, `shopify`, `cx-leaders`, `us.help`, `rhodeadmin` |
| `duplicate` | Same LinkedIn URL or same email as another contact in same account (keep most-complete row) |
| `incomplete` | Has a real name but missing title AND LinkedIn URL |
| `clean` | Has name, email, and at least one of: title or LinkedIn URL; not flagged by above |

### Duplicate Merging
- Becca Millstein (3 rows, Fishwife) → merge into one; keep earliest `first_touch_date`
- Danielle Gough / Danielle Robinson (DUSK, same LinkedIn URL) → merge; note name change as signal
- Kelynn Berdine (2 Rhode Resort rows, same LinkedIn + email) → merge
- Ryan Hofmann / Ryan Hoffman (Thrive, same LinkedIn URL) → merge; note as duplicate
- Haris Shaikh (appears in both DUSK domains) → merge under merged DUSK account

---

## 5. Feature Scope

### MVP
1. **CSV Ingestion + Cleaning Pipeline** — upload, parse, deduplicate, flag, normalize, store
2. **Account Dashboard** — card per account, traffic-light signal badges, CRM health score, filter/sort
3. **Stakeholder Intelligence Panel** (per account) — CRM contacts (left col) vs detected stakeholders (right col)
4. **Signal Detection** — title change, left company, new stakeholder (via Proxycurl)
5. **Industry Classification + Trends** — OpenAI + Tavily per account
6. **Data Quality Dashboard** — per-account breakdown: clean / incomplete / junk / duplicate counts

### Nice-to-Have (Phase 2)
- Thought leader detection (LinkedIn follower count, Tavily mentions)
- Daily CRON re-enrichment with Supabase Realtime push
- CRM Action Items export (CSV of recommended adds/removes/updates)
- Renewal Risk Score (1–100 composite)

---

## 6. UI Layout

### Dashboard (`/`)
- Sidebar nav (dark) + main content area (light)
- Account cards in a grid, sorted by signal severity descending
- Each card: company name, industry tag, CSM, # contacts, # active signals, CRM health bar, traffic-light badge
- Filter bar: by severity, account stage, CSM name

### Account Detail (`/accounts/[id]`)
- Header: company name, website, LinkedIn, industry insight card
- Two-column stakeholder panel:
  - Left: "In CRM" — contacts with enrichment status and signal badges
  - Right: "Not in CRM" — detected stakeholders from Proxycurl company employee search
- Signals timeline: chronological list of all signals, dismissible, severity-colored
- Data quality strip: counts by flag type

### Contact Detail (`/accounts/[id]/contacts/[contactId]`)
- Name, title (CRM vs LinkedIn diff if mismatch), email, LinkedIn link
- Enrichment status + last enriched timestamp
- Signal history for this contact

---

## 7. Enrichment Pipeline (Inngest Steps)

```
Step 1: ingest-csv
  → Parse CSV with Papa Parse
  → Apply cleaning rules
  → Merge duplicate contacts
  → Normalize accounts
  → Write to Supabase

Step 2: enrich-contact (fan-out per contact with LinkedIn URL)
  → Proxycurl Person Profile API
  → Compare current_title vs CRM title (fuzzy match)
  → Compare current_company vs account name
  → If mismatch → insert signal (title_change or left_company)
  → Rate limit: 1 req/sec

Step 3: detect-new-stakeholders (per account with LinkedIn company URL)
  → Proxycurl Company Employees API (filter by title keywords)
  → Cross-reference against CRM contacts
  → Unknown person with relevant title → insert signal (new_stakeholder)

Step 4: industry-intel (per account)
  → Tavily search: "{company} ecommerce news 2025"
  → OpenAI: classify industry + generate 2-3 sentence trend summary
  → Store in industry_intel table

Step 5: thought-leaders (per contact, Phase 2)
  → Tavily search: "{name} {company} conference OR podcast OR interview"
  → OpenAI: summarize public presence
  → Store in thought_leaders table
```

**Fuzzy title match definition:** Normalize both strings — lowercase, expand abbreviations (`dir→director`, `vp→vice president`, `sr→senior`, `mgr→manager`, `mktg→marketing`). Flag as mismatch if normalized strings differ by more than 20% Levenshtein distance or contain different seniority tokens.

**Relevant title keywords for Proxycurl employee search:** `retention`, `crm`, `email`, `sms`, `lifecycle`, `loyalty`, `ecommerce`, `growth`, `digital`, `marketing`. Also include seniority tokens `vp`, `director`, `head`, `manager` without domain to catch generalist senior stakeholders.

**`is_relevant_stakeholder` flag:** Set to `true` during ingest if contact title contains any of the above keywords (case-insensitive). Used to filter the "In CRM" panel to show most relevant contacts first.

**`crm_health_score` formula:** `(clean_contacts / total_contacts) * 0.7 + (dismissed_or_zero_critical_signals ? 0.3 : 0)`. Range 0–1, displayed as a progress bar. Recomputed on every enrichment run.

Signal severity assignment:
- `critical`: Main POC or Champion contact has left company
- `warning`: Any stakeholder title or company change
- `info`: New person detected, thought leader activity

---

## 8. Repository Structure

```
postscript-renewal-intel/
├── app/
│   ├── page.tsx                      # Dashboard
│   ├── accounts/[id]/page.tsx        # Account detail
│   ├── accounts/[id]/contacts/[contactId]/page.tsx
│   ├── api/
│   │   ├── ingest/route.ts           # CSV upload + clean
│   │   ├── enrich/route.ts           # Trigger Inngest enrichment
│   │   ├── signals/route.ts          # Get/dismiss signals
│   │   └── inngest/route.ts          # Inngest event handler
│   └── layout.tsx
├── components/
│   ├── AccountCard.tsx
│   ├── SignalBadge.tsx
│   ├── StakeholderPanel.tsx
│   ├── DataQualityMeter.tsx
│   └── IndustryInsight.tsx
├── lib/
│   ├── enrichment/
│   │   ├── proxycurl.ts              # LinkedIn API client
│   │   ├── tavily.ts                 # Web search client
│   │   └── openai.ts                 # Classification + summaries
│   ├── cleaning/
│   │   ├── normalize.ts              # Company name normalization
│   │   ├── dedup.ts                  # Contact deduplication
│   │   └── validate.ts               # Data quality scoring
│   ├── inngest/
│   │   ├── client.ts                 # Inngest client
│   │   └── functions/
│   │       ├── enrich-contact.ts
│   │       ├── detect-stakeholders.ts
│   │       └── industry-intel.ts
│   └── supabase.ts                   # DB client
├── supabase/
│   └── migrations/001_init.sql
├── .env.example
└── DECISIONS.md
```

---

## 9. Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
PROXYCURL_API_KEY=
OPENAI_API_KEY=
TAVILY_API_KEY=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

---

## 10. Key Design Decisions

See `DECISIONS.md` for full rationale. Summary:
- Rhode resort and rhode skin are separate accounts — different industries, LinkedIn URLs, and contact sets
- DUSK dual-domain is merged — overlapping contacts confirm it's one company
- `rhode.pro` is quarantined, not enriched — single placeholder row provides no signal value
- Junk detection is aggressive by design — API credits are finite; surface noise for CSM review rather than waste credits on `Help US`
- Title matching uses fuzzy compare — "Dir of Retention" ≈ "Director of Retention"; exact match misses most real changes
- Every signal is dismissible — prevents dashboard noise from false positives
- Internal Postscript email (`@postscript.io`) excluded from enrichment — Aaron Fox is a vendor contact, not a customer stakeholder
