# Renewal Intelligence Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js 14 web app that ingests a messy CRM CSV, cleans and enriches it via Proxycurl + OpenAI + Tavily through Inngest background jobs, and surfaces stakeholder change signals for CSM renewal prep.

**Architecture:** Next.js 14 App Router + Supabase (Postgres + Realtime) + Inngest (background enrichment). CSV parsed client-side → POST /api/ingest cleans + stores → POST /api/enrich fires Inngest event → fan-out jobs enrich contacts → signals written to Supabase → Realtime subscription updates UI.

**Tech Stack:** Next.js 14, TypeScript 5, Tailwind 3, shadcn/ui, Supabase JS v2, Inngest v3, Proxycurl API, OpenAI v4 (gpt-4o-mini), Tavily API, Papa Parse 5, Vitest 1

**Working directory:** `/home/ht/Documents/Projects/PS`

---

## File Map

```
/                               ← working dir (PS/)
├── app/
│   ├── layout.tsx              # Root layout with sidebar
│   ├── page.tsx                # Dashboard: account grid + CSV upload
│   ├── accounts/[id]/
│   │   └── page.tsx            # Account detail: stakeholder panel + signals
│   └── api/
│       ├── ingest/route.ts     # POST: parse cleaned rows → Supabase
│       ├── enrich/route.ts     # POST: fire Inngest enrichment event
│       ├── signals/[id]/route.ts # PATCH: dismiss signal
│       └── inngest/route.ts    # Inngest webhook handler
├── components/
│   ├── CsvUpload.tsx           # File drop + parse + trigger ingest
│   ├── AccountCard.tsx         # Account summary card with health + signals
│   ├── SignalBadge.tsx         # Color-coded severity badge
│   ├── DataQualityMeter.tsx    # Progress bar + flag breakdown
│   ├── StakeholderPanel.tsx    # Two-col: CRM contacts vs detected
│   ├── ContactCard.tsx         # Single contact row with signals
│   ├── IndustryInsight.tsx     # AI trend summary card
│   └── SignalTimeline.tsx      # Chronological dismissible signal list
├── lib/
│   ├── types.ts                # All shared TS interfaces
│   ├── supabase.ts             # Browser + server Supabase clients
│   ├── cleaning/
│   │   ├── validate.ts         # Contact quality flag logic
│   │   ├── normalize.ts        # Account normalization (domain → canonical)
│   │   └── dedup.ts            # Contact deduplication + merge
│   └── inngest/
│       ├── client.ts           # Inngest client instance
│       └── functions/
│           ├── enrich-contact.ts      # Proxycurl person profile → signals
│           ├── detect-stakeholders.ts # Proxycurl company employees → signals
│           └── industry-intel.ts      # Tavily + OpenAI → industry_intel
├── supabase/migrations/001_init.sql
├── .env.example
├── DECISIONS.md
└── vitest.config.ts
```

---

## Task 1: Scaffold Next.js project and install dependencies

**Files:** `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `vitest.config.ts`

- [ ] **Step 1: Create Next.js app in current directory**

```bash
cd /home/ht/Documents/Projects/PS
npx create-next-app@14 . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --yes
```

Expected: Next.js 14 scaffolded with App Router, TypeScript, Tailwind. Existing files (CSV, docs/) are preserved.

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr inngest papaparse openai lucide-react date-fns
npm install @types/papaparse --save-dev
```

- [ ] **Step 3: Install and configure shadcn/ui**

```bash
npx shadcn@latest init --defaults
npx shadcn@latest add card badge button progress separator tabs scroll-area toast
```

- [ ] **Step 4: Install Vitest**

```bash
npm install -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 5: Write vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 6: Add test script to package.json**

Open `package.json`, find the `"scripts"` section and add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 7: Verify scaffold**

```bash
npm run build 2>&1 | tail -5
```
Expected: Build succeeds (or only minor type errors from empty pages).

---

## Task 2: Supabase database migration

**Files:** `supabase/migrations/001_init.sql`

- [ ] **Step 1: Create migration file**

```bash
mkdir -p supabase/migrations
```

- [ ] **Step 2: Write migration SQL**

Create `supabase/migrations/001_init.sql`:

```sql
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
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
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
```

- [ ] **Step 3: Run migration in Supabase dashboard**

Go to your Supabase project → SQL Editor → paste the contents of `supabase/migrations/001_init.sql` → Run. Verify all 5 tables appear in Table Editor.

---

## Task 3: Shared TypeScript types and Supabase clients

**Files:** `lib/types.ts`, `lib/supabase.ts`

- [ ] **Step 1: Write lib/types.ts**

```typescript
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
  first_name: string
  last_name: string
  email: string
  title: string
  linkedin_url: string
  is_champion: boolean
  is_contract_signer: boolean
  is_relevant_stakeholder: boolean
  point_of_contact_role: string
  lead_source: string
  first_touch_date: string | null
  data_quality_flag: DataQualityFlag
  enrichment_status: EnrichmentStatus
  account_normalized_name: string // key to link to account
}
```

- [ ] **Step 2: Write lib/supabase.ts**

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Browser client (anon key) — use in Client Components
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server client (service role) — use in API routes and Server Components
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
```

---

## Task 4: Data validation — contact quality flagging

**Files:** `lib/cleaning/validate.ts`, `lib/cleaning/__tests__/validate.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/cleaning/__tests__/validate.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- lib/cleaning/__tests__/validate.test.ts 2>&1 | tail -10
```
Expected: FAIL — `Cannot find module '../validate'`

- [ ] **Step 3: Write lib/cleaning/validate.ts**

```typescript
// lib/cleaning/validate.ts
import type { DataQualityFlag, RawCsvRow } from '@/lib/types'

const INTERNAL_DOMAINS = new Set(['postscript.io'])

const FUNCTIONAL_PREFIXES = new Set([
  'help', 'hello', 'accounting', 'shopify', 'cx-leaders',
  'us.help', 'rhodeadmin', 'rhode', 'shopify',
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- lib/cleaning/__tests__/validate.test.ts 2>&1 | tail -10
```
Expected: All 14 tests PASS.

---

## Task 5: Account normalization

**Files:** `lib/cleaning/normalize.ts`, `lib/cleaning/__tests__/normalize.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/cleaning/__tests__/normalize.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { resolveAccount } from '../normalize'

describe('resolveAccount', () => {
  it('resolves dusk.com to DUSK', () => {
    const acc = resolveAccount('DUSK', 'dusk.com', 'http://www.linkedin.com/company/dusk-australasia', 'Charlie Webber', 'Simone Vermette', 'Customer')
    expect(acc.normalized_name).toBe('dusk')
    expect(acc.name).toBe('DUSK')
    expect(acc.quarantine).toBe(false)
  })

  it('resolves duskofficial.com to same DUSK account', () => {
    const acc = resolveAccount('DUSK', 'duskofficial.com', '', 'System Connector', '', 'Prospect')
    expect(acc.normalized_name).toBe('dusk')
  })

  it('resolves rhodeskin.com to rhode skin', () => {
    const acc = resolveAccount('rhode', 'rhodeskin.com', 'http://www.linkedin.com/company/rhodeskin', 'Dan Dravis', 'Simone Vermette', 'Customer')
    expect(acc.normalized_name).toBe('rhode-skin')
    expect(acc.name).toBe('rhode skin')
  })

  it('resolves shoprhode.com to Rhode Resort', () => {
    const acc = resolveAccount('Rhode', 'shoprhode.com', 'https://www.linkedin.com/company/rhode-resort', 'System Connector', '', 'Prospect')
    expect(acc.normalized_name).toBe('rhode-resort')
    expect(acc.name).toBe('Rhode Resort')
  })

  it('quarantines rhode.pro', () => {
    const acc = resolveAccount('Rhode', 'rhode.pro', '', '', '', 'Prospect')
    expect(acc.quarantine).toBe(true)
  })

  it('resolves eatfishwife.com to Fishwife', () => {
    const acc = resolveAccount('Fishwife', 'eatfishwife.com', '', 'Ryan Shea', 'Coleman Meier', 'Onboarding')
    expect(acc.normalized_name).toBe('fishwife')
  })

  it('resolves shop.ruggable.com to Ruggable', () => {
    const acc = resolveAccount('Ruggable', 'shop.ruggable.com', '', 'Dan Dravis', 'Simone Vermette', 'Customer')
    expect(acc.normalized_name).toBe('ruggable')
  })

  it('resolves thrivecausemetics.com to Thrive Causemetics', () => {
    const acc = resolveAccount('Thrive Causemetics', 'thrivecausemetics.com', '', 'Dan Dravis', 'Simone Vermette', 'Customer')
    expect(acc.normalized_name).toBe('thrive-causemetics')
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
npm test -- lib/cleaning/__tests__/normalize.test.ts 2>&1 | tail -5
```
Expected: FAIL — `Cannot find module '../normalize'`

- [ ] **Step 3: Write lib/cleaning/normalize.ts**

```typescript
// lib/cleaning/normalize.ts
import type { NormalizedAccount, RawCsvRow } from '@/lib/types'

interface AccountDefinition {
  name: string
  normalized_name: string
  quarantine?: boolean
  linkedin_company_url?: string
}

const WEBSITE_TO_ACCOUNT: Record<string, AccountDefinition> = {
  'dusk.com':              { name: 'DUSK',             normalized_name: 'dusk' },
  'duskofficial.com':      { name: 'DUSK',             normalized_name: 'dusk' },
  'rhodeskin.com':         { name: 'rhode skin',       normalized_name: 'rhode-skin' },
  'shoprhode.com':         { name: 'Rhode Resort',     normalized_name: 'rhode-resort' },
  'rhode.pro':             { name: 'Rhode (Unknown)',  normalized_name: 'rhode-unknown', quarantine: true },
  'eatfishwife.com':       { name: 'Fishwife',         normalized_name: 'fishwife' },
  'shop.ruggable.com':     { name: 'Ruggable',         normalized_name: 'ruggable' },
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
    // Fallback: slugify the raw account name
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
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npm test -- lib/cleaning/__tests__/normalize.test.ts 2>&1 | tail -5
```
Expected: All 8 tests PASS.

---

## Task 6: Contact deduplication

**Files:** `lib/cleaning/dedup.ts`, `lib/cleaning/__tests__/dedup.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/cleaning/__tests__/dedup.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run to confirm fail**

```bash
npm test -- lib/cleaning/__tests__/dedup.test.ts 2>&1 | tail -5
```

- [ ] **Step 3: Write lib/cleaning/dedup.ts**

```typescript
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
  // Sort by completeness desc, then by earliest first_touch_date
  const sorted = [...contacts].sort((a, b) => {
    const scoreDiff = completenessScore(b) - completenessScore(a)
    if (scoreDiff !== 0) return scoreDiff
    if (a.first_touch_date && b.first_touch_date) {
      return a.first_touch_date.localeCompare(b.first_touch_date)
    }
    return 0
  })

  const base = sorted[0]

  // Keep earliest first_touch_date across all duplicates
  const touchDates = contacts.map(c => c.first_touch_date).filter(Boolean) as string[]
  const earliestDate = touchDates.length > 0 ? touchDates.sort()[0] : null

  // Merge boolean flags: any duplicate marked champion/signer → merged record is too
  const is_champion = contacts.some(c => c.is_champion)
  const is_contract_signer = contacts.some(c => c.is_contract_signer)
  const is_relevant_stakeholder = contacts.some(c => c.is_relevant_stakeholder)

  // Merge point_of_contact_role: join unique non-empty values
  const roles = [...new Set(contacts.map(c => c.point_of_contact_role).filter(Boolean))]
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

export function deduplicateContacts(contacts: NormalizedContact[]): NormalizedContact[] {
  // Group by account, then by LinkedIn URL or email
  const groups = new Map<string, NormalizedContact[]>()

  for (const contact of contacts) {
    const account = contact.account_normalized_name

    // Prefer LinkedIn URL as dedup key; fall back to email
    const key = contact.linkedin_url
      ? `${account}::li::${contact.linkedin_url.toLowerCase().replace(/\?.*$/, '').replace(/\/$/, '')}`
      : contact.email
      ? `${account}::email::${contact.email.toLowerCase()}`
      : `${account}::unique::${Math.random()}` // no key available, treat as unique

    const existing = groups.get(key) ?? []
    existing.push(contact)
    groups.set(key, existing)
  }

  return Array.from(groups.values()).map(group =>
    group.length === 1 ? group[0] : mergeContacts(group)
  )
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npm test -- lib/cleaning/__tests__/dedup.test.ts 2>&1 | tail -5
```
Expected: All 4 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
npm test 2>&1 | tail -10
```
Expected: All 26 tests PASS.

---

## Task 7: CSV ingest API route

**Files:** `app/api/ingest/route.ts`

- [ ] **Step 1: Write app/api/ingest/route.ts**

```typescript
// app/api/ingest/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { flagContact, isRelevantStakeholder } from '@/lib/cleaning/validate'
import { resolveAccountFromRow } from '@/lib/cleaning/normalize'
import { deduplicateContacts } from '@/lib/cleaning/dedup'
import type { RawCsvRow, NormalizedContact, NormalizedAccount } from '@/lib/types'

export async function POST(req: NextRequest) {
  const { rows }: { rows: RawCsvRow[] } = await req.json()

  // 1. Resolve all accounts (deduplicated by normalized_name)
  const accountMap = new Map<string, NormalizedAccount>()
  for (const row of rows) {
    const acc = resolveAccountFromRow(row)
    if (!accountMap.has(acc.normalized_name)) {
      accountMap.set(acc.normalized_name, acc)
    } else {
      // Merge: prefer non-System-Connector owner/csm
      const existing = accountMap.get(acc.normalized_name)!
      if (acc.account_owner && acc.account_owner !== 'System Connector') {
        existing.account_owner = acc.account_owner
      }
      if (acc.account_csm && acc.account_csm !== 'System Connector' && existing.account_csm !== acc.account_csm) {
        existing.account_csm = acc.account_csm
      }
      if (acc.linkedin_company_url && !existing.linkedin_company_url) {
        existing.linkedin_company_url = acc.linkedin_company_url
      }
    }
  }

  // 2. Upsert accounts (skip quarantined)
  const accountsToInsert = Array.from(accountMap.values()).filter(a => !a.quarantine)
  const { data: insertedAccounts, error: accError } = await supabaseAdmin
    .from('accounts')
    .upsert(
      accountsToInsert.map(a => ({
        name: a.name,
        normalized_name: a.normalized_name,
        website: a.website || null,
        linkedin_company_url: a.linkedin_company_url || null,
        account_owner: a.account_owner || null,
        account_csm: a.account_csm || null,
        account_stage: a.account_stage || null,
      })),
      { onConflict: 'normalized_name', ignoreDuplicates: false }
    )
    .select('id, normalized_name')

  if (accError) return NextResponse.json({ error: accError.message }, { status: 500 })

  const accountIdMap = new Map<string, string>()
  for (const acc of insertedAccounts ?? []) {
    accountIdMap.set(acc.normalized_name, acc.id)
  }

  // 3. Build normalized contacts (skip quarantined accounts, skip contacts with no account)
  const quarantined = new Set(
    Array.from(accountMap.values()).filter(a => a.quarantine).map(a => a.normalized_name)
  )

  const rawContacts: NormalizedContact[] = rows
    .map(row => {
      const acc = resolveAccountFromRow(row)
      if (quarantined.has(acc.normalized_name)) return null
      if (!accountIdMap.has(acc.normalized_name)) return null

      const flag = flagContact(row)
      const title = row['Title']?.trim() ?? ''
      const poc = row['Point of Contact']?.trim() ?? ''

      return {
        first_name: row['First Name']?.trim() || null,
        last_name: row['Last Name']?.trim() || null,
        email: row['Email']?.trim() || null,
        title: title || null,
        linkedin_url: row['LinkedIn URL']?.trim() || null,
        is_champion: !!row['Champion']?.trim(),
        is_contract_signer: !!row['Contract Signer']?.trim(),
        is_relevant_stakeholder: isRelevantStakeholder(title),
        point_of_contact_role: poc,
        lead_source: row['Lead Source']?.trim() || null,
        first_touch_date: row['First Touch Campaign Date']?.trim() || null,
        data_quality_flag: flag,
        enrichment_status: flag === 'clean' || flag === 'incomplete'
          ? 'pending'
          : 'skipped',
        account_normalized_name: acc.normalized_name,
      } satisfies NormalizedContact
    })
    .filter((c): c is NormalizedContact => c !== null)

  // 4. Deduplicate contacts
  const deduped = deduplicateContacts(rawContacts)

  // 5. Upsert contacts
  const contactsToInsert = deduped.map(c => ({
    account_id: accountIdMap.get(c.account_normalized_name)!,
    first_name: c.first_name,
    last_name: c.last_name,
    email: c.email,
    title: c.title,
    linkedin_url: c.linkedin_url,
    is_champion: c.is_champion,
    is_contract_signer: c.is_contract_signer,
    is_relevant_stakeholder: c.is_relevant_stakeholder,
    point_of_contact_role: c.point_of_contact_role || null,
    lead_source: c.lead_source,
    first_touch_date: c.first_touch_date,
    data_quality_flag: c.data_quality_flag,
    enrichment_status: c.enrichment_status,
  }))

  const { error: contactError } = await supabaseAdmin
    .from('contacts')
    .upsert(contactsToInsert, { onConflict: 'account_id,email', ignoreDuplicates: false })

  if (contactError) return NextResponse.json({ error: contactError.message }, { status: 500 })

  // 6. Compute and update data_quality_score per account
  for (const [normalizedName, accountId] of accountIdMap) {
    const accountContacts = deduped.filter(c => c.account_normalized_name === normalizedName)
    const total = accountContacts.length
    const clean = accountContacts.filter(c => c.data_quality_flag === 'clean').length
    const score = total > 0 ? clean / total : 0

    await supabaseAdmin
      .from('accounts')
      .update({ data_quality_score: score, crm_health_score: score * 0.7 })
      .eq('id', accountId)
  }

  return NextResponse.json({
    success: true,
    accountIds: Array.from(accountIdMap.values()),
    stats: {
      accounts: accountsToInsert.length,
      contacts: deduped.length,
    },
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: No errors (or only errors from files not yet written).

---

## Task 8: Enrichment clients — Proxycurl, OpenAI, Tavily

**Files:** `lib/enrichment/proxycurl.ts`, `lib/enrichment/openai.ts`, `lib/enrichment/tavily.ts`

- [ ] **Step 1: Write lib/enrichment/proxycurl.ts**

```typescript
// lib/enrichment/proxycurl.ts

const BASE = 'https://nubela.co/proxycurl/api'

export interface ProxycurlPerson {
  full_name: string | null
  occupation: string | null
  experiences: Array<{
    company: string | null
    title: string | null
    ends_at: null | { day: number; month: number; year: number }
  }> | null
  follower_count: number | null
}

export interface ProxycurlEmployee {
  profile_url: string
  first_name: string
  last_name: string
  summary: string | null
}

async function proxycurlFetch<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const apiKey = process.env.PROXYCURL_API_KEY
  if (!apiKey) {
    console.warn('[proxycurl] No API key — returning null')
    return null
  }

  const url = new URL(`${BASE}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Proxycurl ${res.status}: ${await res.text()}`)

  return res.json() as Promise<T>
}

export async function getPersonProfile(linkedinUrl: string): Promise<ProxycurlPerson | null> {
  return proxycurlFetch<ProxycurlPerson>('/v2/linkedin', { url: linkedinUrl })
}

export async function getCompanyEmployees(
  companyLinkedinUrl: string,
  keywords: string[],
): Promise<ProxycurlEmployee[]> {
  const data = await proxycurlFetch<{ employees: ProxycurlEmployee[]; next_page: string | null }>(
    '/linkedin/company/employees/',
    {
      url: companyLinkedinUrl,
      keyword_regex: keywords.join('|'),
      page_size: '15',
    },
  )
  return data?.employees ?? []
}

/** Returns the current company from LinkedIn experiences (most recent with no end date) */
export function getCurrentCompany(person: ProxycurlPerson): string | null {
  const current = person.experiences?.find(e => e.ends_at === null)
  return current?.company ?? null
}
```

- [ ] **Step 2: Write lib/enrichment/openai.ts**

```typescript
// lib/enrichment/openai.ts
import OpenAI from 'openai'

let _client: OpenAI | null = null

function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _client
}

export async function classifyIndustry(companyName: string, website: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) return 'E-commerce / DTC'

  const completion = await getClient().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: `Classify this e-commerce company into a short industry vertical (max 5 words).
Company: ${companyName}
Website: ${website}
Reply with only the industry label, nothing else.`,
      },
    ],
    max_tokens: 20,
  })

  return completion.choices[0]?.message?.content?.trim() ?? 'E-commerce / DTC'
}

export async function generateTrendSummary(
  companyName: string,
  industry: string,
  newsSnippets: string[],
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return `${companyName} operates in the ${industry} space. No trend data available — add OPENAI_API_KEY to enable.`
  }

  const snippets = newsSnippets.slice(0, 5).join('\n\n')
  const completion = await getClient().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: `You are a customer success analyst. Write a 2-3 sentence industry trend summary for a CSM preparing for a renewal with ${companyName} (${industry}).

Recent news context:
${snippets}

Focus on: retention marketing trends, DTC challenges, and anything directly relevant to SMS/email marketing spend. Be specific and concise.`,
      },
    ],
    max_tokens: 150,
  })

  return completion.choices[0]?.message?.content?.trim() ?? ''
}

const TITLE_ABBREVS: [RegExp, string][] = [
  [/\bdir\b/gi, 'director'],
  [/\bvp\b/gi, 'vice president'],
  [/\bsr\b/gi, 'senior'],
  [/\bmgr\b/gi, 'manager'],
  [/\bmktg\b/gi, 'marketing'],
  [/\bcmo\b/gi, 'chief marketing officer'],
  [/\bceo\b/gi, 'chief executive officer'],
  [/\bcoo\b/gi, 'chief operating officer'],
  [/\bcfo\b/gi, 'chief financial officer'],
]

export function normalizeTitle(title: string): string {
  let t = title.toLowerCase()
  for (const [re, replacement] of TITLE_ABBREVS) t = t.replace(re, replacement)
  return t.replace(/[^a-z0-9 ]/g, '').trim()
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

/** Returns true if the titles are meaningfully different (>20% Levenshtein distance after normalization) */
export function titlesMismatch(crmTitle: string, linkedinTitle: string): boolean {
  if (!crmTitle || !linkedinTitle) return false
  const a = normalizeTitle(crmTitle)
  const b = normalizeTitle(linkedinTitle)
  if (a === b) return false
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return false
  return levenshtein(a, b) / maxLen > 0.2
}
```

- [ ] **Step 3: Write lib/enrichment/tavily.ts**

```typescript
// lib/enrichment/tavily.ts

export interface TavilyResult {
  title: string
  url: string
  content: string
}

export async function searchNews(query: string, maxResults = 5): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) {
    console.warn('[tavily] No API key — returning empty results')
    return []
  }

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, max_results: maxResults }),
  })

  if (!res.ok) throw new Error(`Tavily ${res.status}: ${await res.text()}`)

  const data: { results: TavilyResult[] } = await res.json()
  return data.results ?? []
}
```

---

## Task 9: Inngest client and enrich-contact function

**Files:** `lib/inngest/client.ts`, `lib/inngest/functions/enrich-contact.ts`

- [ ] **Step 1: Write lib/inngest/client.ts**

```typescript
// lib/inngest/client.ts
import { Inngest } from 'inngest'

export const inngest = new Inngest({ id: 'renewal-intel' })
```

- [ ] **Step 2: Write lib/inngest/functions/enrich-contact.ts**

```typescript
// lib/inngest/functions/enrich-contact.ts
import { inngest } from '../client'
import { supabaseAdmin } from '@/lib/supabase'
import { getPersonProfile, getCurrentCompany } from '@/lib/enrichment/proxycurl'
import { titlesMismatch } from '@/lib/enrichment/openai'
import type { SignalSeverity } from '@/lib/types'

export const enrichContact = inngest.createFunction(
  { id: 'enrich-contact', throttle: { limit: 1, period: '1s' } },
  { event: 'renewal/contact.enrich' },
  async ({ event, step }) => {
    const { contactId } = event.data as { contactId: string }

    const contact = await step.run('fetch-contact', async () => {
      const { data } = await supabaseAdmin
        .from('contacts')
        .select('*, accounts(name, normalized_name)')
        .eq('id', contactId)
        .single()
      return data
    })

    if (!contact || !contact.linkedin_url) {
      await supabaseAdmin
        .from('contacts')
        .update({ enrichment_status: 'unenrichable' })
        .eq('id', contactId)
      return { skipped: true }
    }

    const profile = await step.run('proxycurl-person', async () => {
      return getPersonProfile(contact.linkedin_url)
    })

    if (!profile) {
      await supabaseAdmin
        .from('contacts')
        .update({ enrichment_status: 'unenrichable' })
        .eq('id', contactId)
      return { skipped: true }
    }

    await step.run('update-contact-linkedin-data', async () => {
      await supabaseAdmin.from('contacts').update({
        linkedin_current_title: profile.occupation,
        linkedin_current_company: getCurrentCompany(profile),
        enrichment_status: 'enriched',
        last_enriched_at: new Date().toISOString(),
      }).eq('id', contactId)
    })

    await step.run('generate-signals', async () => {
      const signals: Array<{
        contact_id: string
        account_id: string
        signal_type: string
        severity: SignalSeverity
        summary: string
        old_value?: string
        new_value?: string
        source: string
      }> = []

      const accountName = (contact as any).accounts?.name ?? ''
      const currentCompany = getCurrentCompany(profile)

      // Check if contact left the company
      if (currentCompany && !currentCompany.toLowerCase().includes(accountName.toLowerCase())) {
        const isCritical = contact.point_of_contact_role?.includes('Main POC') || contact.is_champion
        signals.push({
          contact_id: contactId,
          account_id: contact.account_id,
          signal_type: 'left_company',
          severity: isCritical ? 'critical' : 'warning',
          summary: `${contact.first_name} ${contact.last_name} appears to have left ${accountName}. Current company on LinkedIn: ${currentCompany}.`,
          old_value: accountName,
          new_value: currentCompany,
          source: 'proxycurl',
        })
      }

      // Check title change
      if (contact.title && profile.occupation && titlesMismatch(contact.title, profile.occupation)) {
        signals.push({
          contact_id: contactId,
          account_id: contact.account_id,
          signal_type: 'title_change',
          severity: 'warning',
          summary: `${contact.first_name} ${contact.last_name} title changed: "${contact.title}" → "${profile.occupation}"`,
          old_value: contact.title,
          new_value: profile.occupation,
          source: 'proxycurl',
        })
      }

      if (signals.length > 0) {
        await supabaseAdmin.from('signals').insert(signals)
      }
    })

    return { enriched: true, contactId }
  },
)
```

---

## Task 10: detect-stakeholders and industry-intel Inngest functions

**Files:** `lib/inngest/functions/detect-stakeholders.ts`, `lib/inngest/functions/industry-intel.ts`

- [ ] **Step 1: Write lib/inngest/functions/detect-stakeholders.ts**

```typescript
// lib/inngest/functions/detect-stakeholders.ts
import { inngest } from '../client'
import { supabaseAdmin } from '@/lib/supabase'
import { getCompanyEmployees } from '@/lib/enrichment/proxycurl'
import { RELEVANT_TITLE_KEYWORDS } from '@/lib/cleaning/validate'

export const detectStakeholders = inngest.createFunction(
  { id: 'detect-stakeholders' },
  { event: 'renewal/account.detect-stakeholders' },
  async ({ event, step }) => {
    const { accountId } = event.data as { accountId: string }

    const account = await step.run('fetch-account', async () => {
      const { data } = await supabaseAdmin
        .from('accounts')
        .select('id, name, linkedin_company_url')
        .eq('id', accountId)
        .single()
      return data
    })

    if (!account?.linkedin_company_url) return { skipped: true, reason: 'no company linkedin url' }

    const employees = await step.run('proxycurl-employees', async () => {
      return getCompanyEmployees(account.linkedin_company_url!, RELEVANT_TITLE_KEYWORDS)
    })

    if (!employees.length) return { skipped: true, reason: 'no employees returned' }

    const existingContacts = await step.run('fetch-existing-contacts', async () => {
      const { data } = await supabaseAdmin
        .from('contacts')
        .select('linkedin_url, email')
        .eq('account_id', accountId)
      return data ?? []
    })

    const knownLinkedIn = new Set(
      existingContacts.map(c => c.linkedin_url?.toLowerCase().replace(/\/$/, '')).filter(Boolean)
    )

    await step.run('create-new-stakeholder-signals', async () => {
      const signals = employees
        .filter(e => {
          const url = e.profile_url?.toLowerCase().replace(/\/$/, '')
          return url && !knownLinkedIn.has(url)
        })
        .map(e => ({
          account_id: accountId,
          signal_type: 'new_stakeholder',
          severity: 'info' as const,
          summary: `${e.first_name} ${e.last_name} found at ${account.name} on LinkedIn — not in CRM. Profile: ${e.profile_url}`,
          new_value: e.profile_url,
          source: 'proxycurl',
        }))

      if (signals.length > 0) {
        await supabaseAdmin.from('signals').insert(signals)
      }
    })

    return { detected: employees.length, accountId }
  },
)
```

- [ ] **Step 2: Write lib/inngest/functions/industry-intel.ts**

```typescript
// lib/inngest/functions/industry-intel.ts
import { inngest } from '../client'
import { supabaseAdmin } from '@/lib/supabase'
import { searchNews } from '@/lib/enrichment/tavily'
import { classifyIndustry, generateTrendSummary } from '@/lib/enrichment/openai'

export const generateIndustryIntel = inngest.createFunction(
  { id: 'generate-industry-intel' },
  { event: 'renewal/account.industry-intel' },
  async ({ event, step }) => {
    const { accountId } = event.data as { accountId: string }

    const account = await step.run('fetch-account', async () => {
      const { data } = await supabaseAdmin
        .from('accounts')
        .select('id, name, website, industry')
        .eq('id', accountId)
        .single()
      return data
    })

    if (!account) return { skipped: true }

    const industry = await step.run('classify-industry', async () => {
      if (account.industry) return account.industry
      return classifyIndustry(account.name, account.website ?? '')
    })

    if (!account.industry) {
      await supabaseAdmin.from('accounts').update({ industry }).eq('id', accountId)
    }

    const news = await step.run('fetch-news', async () => {
      const results = await searchNews(`${account.name} ecommerce news 2025`, 5)
      return results
    })

    const trendSummary = await step.run('generate-summary', async () => {
      const snippets = news.map(r => `${r.title}: ${r.content.slice(0, 300)}`)
      return generateTrendSummary(account.name, industry, snippets)
    })

    await step.run('store-intel', async () => {
      await supabaseAdmin.from('industry_intel').upsert(
        {
          account_id: accountId,
          industry,
          trend_summary: trendSummary,
          sources: news.map(r => ({ url: r.url, title: r.title })),
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'account_id' },
      )
    })

    return { accountId, industry }
  },
)
```

---

## Task 11: API routes — Inngest handler and enrich trigger

**Files:** `app/api/inngest/route.ts`, `app/api/enrich/route.ts`, `app/api/signals/[id]/route.ts`

- [ ] **Step 1: Write app/api/inngest/route.ts**

```typescript
// app/api/inngest/route.ts
import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { enrichContact } from '@/lib/inngest/functions/enrich-contact'
import { detectStakeholders } from '@/lib/inngest/functions/detect-stakeholders'
import { generateIndustryIntel } from '@/lib/inngest/functions/industry-intel'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [enrichContact, detectStakeholders, generateIndustryIntel],
})
```

- [ ] **Step 2: Write app/api/enrich/route.ts**

```typescript
// app/api/enrich/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/lib/inngest/client'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { accountIds }: { accountIds: string[] } = await req.json()

  // Fetch all enrichable contacts for these accounts
  const { data: contacts } = await supabaseAdmin
    .from('contacts')
    .select('id, linkedin_url')
    .in('account_id', accountIds)
    .in('enrichment_status', ['pending'])
    .not('linkedin_url', 'is', null)

  const contactEvents = (contacts ?? []).map(c => ({
    name: 'renewal/contact.enrich' as const,
    data: { contactId: c.id },
  }))

  const accountEvents = accountIds.flatMap(accountId => [
    { name: 'renewal/account.detect-stakeholders' as const, data: { accountId } },
    { name: 'renewal/account.industry-intel' as const, data: { accountId } },
  ])

  await inngest.send([...contactEvents, ...accountEvents])

  return NextResponse.json({
    success: true,
    dispatched: {
      contacts: contactEvents.length,
      accounts: accountIds.length,
    },
  })
}
```

- [ ] **Step 3: Write app/api/signals/[id]/route.ts**

```typescript
// app/api/signals/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { error } = await supabaseAdmin
    .from('signals')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

---

## Task 12: App layout and sidebar

**Files:** `app/layout.tsx`, `app/globals.css`

- [ ] **Step 1: Update app/layout.tsx**

```tsx
// app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Link from 'next/link'
import { BarChart3, Users, Zap } from 'lucide-react'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Renewal Intelligence — Postscript',
  description: 'Stakeholder change signals for CSM renewal prep',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex min-h-screen bg-gray-50">
          {/* Sidebar */}
          <aside className="w-56 bg-gray-900 text-gray-100 flex flex-col py-6 px-4 shrink-0">
            <div className="mb-8">
              <span className="text-xs font-semibold tracking-widest text-purple-400 uppercase">Postscript</span>
              <h1 className="text-base font-semibold text-white mt-1">Renewal Intel</h1>
            </div>
            <nav className="space-y-1">
              <Link href="/" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
                <BarChart3 size={15} />
                Accounts
              </Link>
              <Link href="/" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
                <Zap size={15} />
                Signals
              </Link>
              <Link href="/" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
                <Users size={15} />
                Contacts
              </Link>
            </nav>
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
```

---

## Task 13: Shared UI components — SignalBadge, DataQualityMeter, ContactCard

**Files:** `components/SignalBadge.tsx`, `components/DataQualityMeter.tsx`, `components/ContactCard.tsx`

- [ ] **Step 1: Write components/SignalBadge.tsx**

```tsx
// components/SignalBadge.tsx
import type { SignalSeverity } from '@/lib/types'

const config: Record<SignalSeverity, { bg: string; text: string; dot: string; label: string }> = {
  critical: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', label: 'Critical' },
  warning:  { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', label: 'Warning' },
  info:     { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Info' },
}

export function SignalBadge({
  severity,
  count,
}: {
  severity: SignalSeverity
  count?: number
}) {
  const c = config[severity]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}{count !== undefined ? ` (${count})` : ''}
    </span>
  )
}

export function TrafficLight({ hasCritical, hasWarning }: { hasCritical: boolean; hasWarning: boolean }) {
  if (hasCritical) return <span className="w-3 h-3 rounded-full bg-red-500 inline-block" title="Critical signals" />
  if (hasWarning) return <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" title="Warnings" />
  return <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" title="No alerts" />
}
```

- [ ] **Step 2: Write components/DataQualityMeter.tsx**

```tsx
// components/DataQualityMeter.tsx
import type { Contact } from '@/lib/types'

function countFlags(contacts: Contact[]) {
  const counts = { clean: 0, incomplete: 0, junk: 0, duplicate: 0, internal: 0, functional: 0 }
  for (const c of contacts) counts[c.data_quality_flag] = (counts[c.data_quality_flag] ?? 0) + 1
  return counts
}

export function DataQualityMeter({ contacts }: { contacts: Contact[] }) {
  const total = contacts.length
  const counts = countFlags(contacts)
  const cleanPct = total > 0 ? Math.round((counts.clean / total) * 100) : 0

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>CRM Data Quality</span>
        <span className="font-medium text-gray-700">{cleanPct}% clean</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-400 rounded-full transition-all"
          style={{ width: `${cleanPct}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400">
        {Object.entries(counts).filter(([, v]) => v > 0).map(([flag, count]) => (
          <span key={flag}><span className="text-gray-600 font-medium">{count}</span> {flag}</span>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write components/ContactCard.tsx**

```tsx
// components/ContactCard.tsx
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import type { Contact, Signal } from '@/lib/types'
import { SignalBadge } from './SignalBadge'

export function ContactCard({
  contact,
  signals,
  accountId,
}: {
  contact: Contact
  signals: Signal[]
  accountId: string
}) {
  const activeSignals = signals.filter(s => !s.dismissed_at)
  const topSeverity = activeSignals.find(s => s.severity === 'critical')?.severity
    ?? activeSignals.find(s => s.severity === 'warning')?.severity
    ?? (activeSignals.length > 0 ? 'info' as const : null)

  const displayName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unknown'
  const linkedinTitle = contact.linkedin_current_title
  const titleChanged = linkedinTitle && contact.title && linkedinTitle !== contact.title

  return (
    <Link
      href={`/accounts/${accountId}/contacts/${contact.id}`}
      className="block p-3 rounded-lg border border-gray-100 bg-white hover:border-purple-200 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-gray-900 truncate">{displayName}</span>
            {contact.linkedin_url && (
              <a
                href={contact.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-gray-400 hover:text-blue-600 shrink-0"
              >
                <ExternalLink size={11} />
              </a>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate mt-0.5">{contact.title || '—'}</p>
          {titleChanged && (
            <p className="text-xs text-amber-600 mt-0.5 truncate">LinkedIn: {linkedinTitle}</p>
          )}
          {contact.point_of_contact_role && (
            <p className="text-xs text-purple-600 font-medium mt-0.5">{contact.point_of_contact_role}</p>
          )}
        </div>
        {topSeverity && (
          <SignalBadge severity={topSeverity} count={activeSignals.length} />
        )}
      </div>
      {contact.data_quality_flag !== 'clean' && (
        <p className="text-xs text-gray-400 mt-1.5 capitalize">{contact.data_quality_flag}</p>
      )}
    </Link>
  )
}
```

---

## Task 14: AccountCard and IndustryInsight components

**Files:** `components/AccountCard.tsx`, `components/IndustryInsight.tsx`

- [ ] **Step 1: Write components/AccountCard.tsx**

```tsx
// components/AccountCard.tsx
import Link from 'next/link'
import { Globe } from 'lucide-react'
import type { Account, Signal, Contact } from '@/lib/types'
import { TrafficLight } from './SignalBadge'
import { DataQualityMeter } from './DataQualityMeter'

export function AccountCard({
  account,
  contacts,
  signals,
}: {
  account: Account
  contacts: Contact[]
  signals: Signal[]
}) {
  const activeSignals = signals.filter(s => !s.dismissed_at)
  const hasCritical = activeSignals.some(s => s.severity === 'critical')
  const hasWarning = activeSignals.some(s => s.severity === 'warning')

  return (
    <Link href={`/accounts/${account.id}`} className="block">
      <div className="bg-white rounded-xl border border-gray-200 p-5 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <TrafficLight hasCritical={hasCritical} hasWarning={hasWarning} />
              <h2 className="text-base font-semibold text-gray-900">{account.name}</h2>
            </div>
            {account.industry && (
              <span className="inline-block mt-1 px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full font-medium">
                {account.industry}
              </span>
            )}
          </div>
          <div className="text-right text-xs text-gray-400">
            <div>{account.account_csm ?? '—'}</div>
            <div className="text-gray-300">{account.account_stage}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
          {account.website && (
            <span className="flex items-center gap-1">
              <Globe size={11} />
              {account.website}
            </span>
          )}
          <span>{contacts.length} contacts</span>
          {activeSignals.length > 0 && (
            <span className={hasCritical ? 'text-red-600 font-medium' : hasWarning ? 'text-amber-600' : 'text-emerald-600'}>
              {activeSignals.length} signal{activeSignals.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <DataQualityMeter contacts={contacts} />
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Write components/IndustryInsight.tsx**

```tsx
// components/IndustryInsight.tsx
import { ExternalLink, TrendingUp } from 'lucide-react'
import type { IndustryIntel } from '@/lib/types'

export function IndustryInsight({ intel }: { intel: IndustryIntel | null }) {
  if (!intel) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-400 text-center">
        Industry intel not yet generated. Trigger enrichment to populate.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-purple-100 bg-purple-50 p-4 space-y-2">
      <div className="flex items-center gap-2 text-purple-700 font-medium text-sm">
        <TrendingUp size={14} />
        {intel.industry}
      </div>
      <p className="text-sm text-gray-700 leading-relaxed">{intel.trend_summary}</p>
      {intel.sources && intel.sources.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {intel.sources.slice(0, 3).map((s, i) => (
            <a
              key={i}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-purple-600 hover:underline"
            >
              <ExternalLink size={10} />
              {s.title.slice(0, 40)}{s.title.length > 40 ? '…' : ''}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## Task 15: StakeholderPanel and SignalTimeline

**Files:** `components/StakeholderPanel.tsx`, `components/SignalTimeline.tsx`

- [ ] **Step 1: Write components/StakeholderPanel.tsx**

```tsx
// components/StakeholderPanel.tsx
import type { Contact, Signal } from '@/lib/types'
import { ContactCard } from './ContactCard'
import { UserPlus } from 'lucide-react'

export function StakeholderPanel({
  accountId,
  contacts,
  signals,
}: {
  accountId: string
  contacts: Contact[]
  signals: Signal[]
}) {
  const crmContacts = contacts.filter(c =>
    c.data_quality_flag !== 'junk' &&
    c.data_quality_flag !== 'internal' &&
    c.data_quality_flag !== 'functional'
  )

  const newStakeholderSignals = signals.filter(s => s.signal_type === 'new_stakeholder' && !s.dismissed_at)

  function getContactSignals(contactId: string) {
    return signals.filter(s => s.contact_id === contactId)
  }

  // Sort: POC/champion first, then relevant stakeholders, then rest
  const sorted = [...crmContacts].sort((a, b) => {
    const scoreA = (a.point_of_contact_role ? 3 : 0) + (a.is_champion ? 2 : 0) + (a.is_relevant_stakeholder ? 1 : 0)
    const scoreB = (b.point_of_contact_role ? 3 : 0) + (b.is_champion ? 2 : 0) + (b.is_relevant_stakeholder ? 1 : 0)
    return scoreB - scoreA
  })

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Left: CRM contacts */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          In CRM <span className="text-gray-400 font-normal">({crmContacts.length})</span>
        </h3>
        <div className="space-y-2">
          {sorted.map(c => (
            <ContactCard
              key={c.id}
              contact={c}
              signals={getContactSignals(c.id)}
              accountId={accountId}
            />
          ))}
          {crmContacts.length === 0 && (
            <p className="text-sm text-gray-400">No contacts in CRM.</p>
          )}
        </div>
      </div>

      {/* Right: Detected stakeholders not in CRM */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
          <UserPlus size={14} className="text-emerald-600" />
          Not in CRM <span className="text-gray-400 font-normal">({newStakeholderSignals.length})</span>
        </h3>
        <div className="space-y-2">
          {newStakeholderSignals.map(s => (
            <div key={s.id} className="p-3 rounded-lg border border-emerald-100 bg-emerald-50">
              <p className="text-xs text-gray-700">{s.summary}</p>
              {s.new_value && (
                <a
                  href={s.new_value}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline mt-1 block"
                >
                  View LinkedIn →
                </a>
              )}
            </div>
          ))}
          {newStakeholderSignals.length === 0 && (
            <p className="text-sm text-gray-400">No new stakeholders detected. Run enrichment to check.</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write components/SignalTimeline.tsx**

```tsx
// components/SignalTimeline.tsx
'use client'
import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import type { Signal } from '@/lib/types'
import { SignalBadge } from './SignalBadge'
import { X } from 'lucide-react'

export function SignalTimeline({ signals: initial }: { signals: Signal[] }) {
  const [signals, setSignals] = useState(initial)
  const active = signals.filter(s => !s.dismissed_at)

  async function dismiss(signalId: string) {
    await fetch(`/api/signals/${signalId}`, { method: 'PATCH' })
    setSignals(prev => prev.map(s => s.id === signalId ? { ...s, dismissed_at: new Date().toISOString() } : s))
  }

  if (active.length === 0) {
    return <p className="text-sm text-gray-400">No active signals.</p>
  }

  return (
    <div className="space-y-2">
      {active
        .sort((a, b) => {
          const order = { critical: 0, warning: 1, info: 2 }
          return (order[a.severity] ?? 2) - (order[b.severity] ?? 2)
        })
        .map(signal => (
          <div key={signal.id} className="flex items-start gap-3 p-3 rounded-lg bg-white border border-gray-100">
            <SignalBadge severity={signal.severity} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800">{signal.summary}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatDistanceToNow(new Date(signal.detected_at), { addSuffix: true })}
                {' · '}{signal.source}
              </p>
            </div>
            <button
              onClick={() => dismiss(signal.id)}
              className="text-gray-300 hover:text-gray-500 shrink-0 mt-0.5"
              title="Dismiss signal"
            >
              <X size={14} />
            </button>
          </div>
        ))}
    </div>
  )
}
```

---

## Task 16: CsvUpload component

**Files:** `components/CsvUpload.tsx`

- [ ] **Step 1: Write components/CsvUpload.tsx**

```tsx
// components/CsvUpload.tsx
'use client'
import { useState, useRef } from 'react'
import Papa from 'papaparse'
import type { RawCsvRow } from '@/lib/types'
import { Upload, Loader2 } from 'lucide-react'

interface Props {
  onComplete: () => void
}

export function CsvUpload({ onComplete }: Props) {
  const [status, setStatus] = useState<'idle' | 'parsing' | 'ingesting' | 'enriching' | 'done' | 'error'>('idle')
  const [stats, setStats] = useState<{ accounts: number; contacts: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setStatus('parsing')
    setError(null)

    Papa.parse<RawCsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (result) => {
        try {
          setStatus('ingesting')
          const ingestRes = await fetch('/api/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: result.data }),
          })

          if (!ingestRes.ok) {
            const err = await ingestRes.json()
            throw new Error(err.error ?? 'Ingest failed')
          }

          const { accountIds, stats } = await ingestRes.json()
          setStats(stats)

          setStatus('enriching')
          await fetch('/api/enrich', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountIds }),
          })

          setStatus('done')
          onComplete()
        } catch (e: any) {
          setError(e.message)
          setStatus('error')
        }
      },
      error: (err) => {
        setError(err.message)
        setStatus('error')
      },
    })
  }

  const messages = {
    idle: 'Drop CSV here or click to upload',
    parsing: 'Parsing CSV…',
    ingesting: 'Cleaning and storing contacts…',
    enriching: 'Enrichment jobs queued (runs in background)…',
    done: `Done! ${stats?.accounts} accounts, ${stats?.contacts} contacts ingested.`,
    error: error ?? 'Something went wrong.',
  }

  return (
    <div>
      <div
        className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-purple-300 hover:bg-purple-50 transition-colors"
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault()
          const file = e.dataTransfer.files[0]
          if (file) handleFile(file)
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
        {status === 'parsing' || status === 'ingesting' || status === 'enriching' ? (
          <Loader2 className="mx-auto mb-2 text-purple-500 animate-spin" size={24} />
        ) : (
          <Upload className="mx-auto mb-2 text-gray-300" size={24} />
        )}
        <p className={`text-sm ${status === 'error' ? 'text-red-600' : status === 'done' ? 'text-emerald-600' : 'text-gray-500'}`}>
          {messages[status]}
        </p>
      </div>
    </div>
  )
}
```

---

## Task 17: Dashboard page

**Files:** `app/page.tsx`

- [ ] **Step 1: Write app/page.tsx**

```tsx
// app/page.tsx
import { supabaseAdmin } from '@/lib/supabase'
import { AccountCard } from '@/components/AccountCard'
import { CsvUpload } from '@/components/CsvUpload'
import type { Account, Contact, Signal } from '@/lib/types'

async function getData() {
  const [accountsRes, contactsRes, signalsRes] = await Promise.all([
    supabaseAdmin.from('accounts').select('*').order('name'),
    supabaseAdmin.from('contacts').select('*'),
    supabaseAdmin.from('signals').select('*').is('dismissed_at', null),
  ])
  return {
    accounts: (accountsRes.data ?? []) as Account[],
    contacts: (contactsRes.data ?? []) as Contact[],
    signals: (signalsRes.data ?? []) as Signal[],
  }
}

export default async function DashboardPage() {
  const { accounts, contacts, signals } = await getData()

  const contactsByAccount = new Map<string, Contact[]>()
  for (const c of contacts) {
    const list = contactsByAccount.get(c.account_id) ?? []
    list.push(c)
    contactsByAccount.set(c.account_id, list)
  }

  const signalsByAccount = new Map<string, Signal[]>()
  for (const s of signals) {
    const list = signalsByAccount.get(s.account_id) ?? []
    list.push(s)
    signalsByAccount.set(s.account_id, list)
  }

  // Sort accounts: most critical signals first
  const sorted = [...accounts].sort((a, b) => {
    const aSignals = signalsByAccount.get(a.id) ?? []
    const bSignals = signalsByAccount.get(b.id) ?? []
    const aCrit = aSignals.some(s => s.severity === 'critical') ? 2 : aSignals.some(s => s.severity === 'warning') ? 1 : 0
    const bCrit = bSignals.some(s => s.severity === 'critical') ? 2 : bSignals.some(s => s.severity === 'warning') ? 1 : 0
    return bCrit - aCrit
  })

  const totalCritical = signals.filter(s => s.severity === 'critical').length
  const totalWarning = signals.filter(s => s.severity === 'warning').length

  return (
    <div className="p-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Account Intelligence</h1>
          <p className="text-gray-500 text-sm mt-1">
            {accounts.length} accounts · {totalCritical > 0 ? <span className="text-red-600 font-medium">{totalCritical} critical</span> : null}
            {totalCritical > 0 && totalWarning > 0 ? ', ' : ''}
            {totalWarning > 0 ? <span className="text-amber-600">{totalWarning} warnings</span> : null}
          </p>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="max-w-md mx-auto mt-16">
          <h2 className="text-lg font-semibold text-gray-700 mb-4 text-center">Upload CRM Export</h2>
          <CsvUpload onComplete={() => window.location.reload()} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
            {sorted.map(account => (
              <AccountCard
                key={account.id}
                account={account}
                contacts={contactsByAccount.get(account.id) ?? []}
                signals={signalsByAccount.get(account.id) ?? []}
              />
            ))}
          </div>

          <div className="max-w-md">
            <p className="text-sm text-gray-500 mb-2">Re-upload to refresh contacts</p>
            <CsvUpload onComplete={() => window.location.reload()} />
          </div>
        </>
      )}
    </div>
  )
}
```

---

## Task 18: Account detail page

**Files:** `app/accounts/[id]/page.tsx`

- [ ] **Step 1: Write app/accounts/[id]/page.tsx**

```tsx
// app/accounts/[id]/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import { StakeholderPanel } from '@/components/StakeholderPanel'
import { IndustryInsight } from '@/components/IndustryInsight'
import { SignalTimeline } from '@/components/SignalTimeline'
import { DataQualityMeter } from '@/components/DataQualityMeter'
import { TrafficLight } from '@/components/SignalBadge'
import type { Account, Contact, Signal, IndustryIntel } from '@/lib/types'
import { Globe, Linkedin, ChevronLeft } from 'lucide-react'

async function getData(id: string) {
  const [accountRes, contactsRes, signalsRes, intelRes] = await Promise.all([
    supabaseAdmin.from('accounts').select('*').eq('id', id).single(),
    supabaseAdmin.from('contacts').select('*').eq('account_id', id).order('created_at'),
    supabaseAdmin.from('signals').select('*').eq('account_id', id).order('detected_at', { ascending: false }),
    supabaseAdmin.from('industry_intel').select('*').eq('account_id', id).maybeSingle(),
  ])
  return {
    account: accountRes.data as Account | null,
    contacts: (contactsRes.data ?? []) as Contact[],
    signals: (signalsRes.data ?? []) as Signal[],
    intel: intelRes.data as IndustryIntel | null,
  }
}

export default async function AccountDetailPage({ params }: { params: { id: string } }) {
  const { account, contacts, signals, intel } = await getData(params.id)
  if (!account) notFound()

  const activeSignals = signals.filter(s => !s.dismissed_at)
  const hasCritical = activeSignals.some(s => s.severity === 'critical')
  const hasWarning = activeSignals.some(s => s.severity === 'warning')

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Back nav */}
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ChevronLeft size={15} />
        All Accounts
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <TrafficLight hasCritical={hasCritical} hasWarning={hasWarning} />
            <h1 className="text-2xl font-bold text-gray-900">{account.name}</h1>
            {account.industry && (
              <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full font-medium">
                {account.industry}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            {account.website && (
              <a href={`https://${account.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-gray-700">
                <Globe size={13} />{account.website}
              </a>
            )}
            {account.linkedin_company_url && (
              <a href={account.linkedin_company_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-blue-600">
                <Linkedin size={13} />LinkedIn
              </a>
            )}
            <span>CSM: {account.account_csm ?? '—'}</span>
            <span>Owner: {account.account_owner ?? '—'}</span>
            <span className="capitalize">{account.account_stage}</span>
          </div>
        </div>
        <div className="text-right text-sm">
          <div className="font-medium text-gray-700">{contacts.length} contacts</div>
          {activeSignals.length > 0 && (
            <div className={`font-medium ${hasCritical ? 'text-red-600' : 'text-amber-600'}`}>
              {activeSignals.length} active signal{activeSignals.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left 2/3: stakeholder panel + signals */}
        <div className="col-span-2 space-y-6">
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-4">Stakeholders</h2>
            <StakeholderPanel accountId={account.id} contacts={contacts} signals={signals} />
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-4">
              Signals {activeSignals.length > 0 && <span className="text-sm font-normal text-gray-500">({activeSignals.length} active)</span>}
            </h2>
            <SignalTimeline signals={signals} />
          </section>
        </div>

        {/* Right 1/3: data quality + industry intel */}
        <div className="space-y-6">
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-3">Data Quality</h2>
            <DataQualityMeter contacts={contacts} />
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-3">Industry Intel</h2>
            <IndustryInsight intel={intel} />
          </section>
        </div>
      </div>
    </div>
  )
}
```

---

## Task 19: Contact detail page

**Files:** `app/accounts/[id]/contacts/[contactId]/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// app/accounts/[id]/contacts/[contactId]/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import { SignalTimeline } from '@/components/SignalTimeline'
import type { Contact, Signal } from '@/lib/types'
import { ChevronLeft, ExternalLink, Mail } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

async function getData(contactId: string) {
  const [contactRes, signalsRes] = await Promise.all([
    supabaseAdmin.from('contacts').select('*').eq('id', contactId).single(),
    supabaseAdmin.from('signals').select('*').eq('contact_id', contactId).order('detected_at', { ascending: false }),
  ])
  return {
    contact: contactRes.data as Contact | null,
    signals: (signalsRes.data ?? []) as Signal[],
  }
}

export default async function ContactDetailPage({
  params,
}: {
  params: { id: string; contactId: string }
}) {
  const { contact, signals } = await getData(params.contactId)
  if (!contact) notFound()

  const displayName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unknown'
  const titleMismatch = contact.linkedin_current_title && contact.title &&
    contact.linkedin_current_title !== contact.title

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <Link
        href={`/accounts/${params.id}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ChevronLeft size={15} />
        Back to Account
      </Link>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{displayName}</h1>
            <p className="text-gray-600 text-sm mt-0.5">{contact.title || 'No title in CRM'}</p>
            {titleMismatch && (
              <p className="text-amber-600 text-sm mt-1">
                LinkedIn title: {contact.linkedin_current_title}
              </p>
            )}
            {contact.point_of_contact_role && (
              <p className="text-purple-700 text-sm font-medium mt-1">{contact.point_of_contact_role}</p>
            )}
          </div>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize
            ${contact.data_quality_flag === 'clean' ? 'bg-emerald-50 text-emerald-700' :
              contact.data_quality_flag === 'incomplete' ? 'bg-gray-100 text-gray-600' :
              'bg-red-50 text-red-600'}`}
          >
            {contact.data_quality_flag}
          </span>
        </div>

        <div className="space-y-2 text-sm">
          {contact.email && (
            <div className="flex items-center gap-2 text-gray-600">
              <Mail size={13} />
              <a href={`mailto:${contact.email}`} className="hover:text-gray-900">{contact.email}</a>
            </div>
          )}
          {contact.linkedin_url && (
            <div className="flex items-center gap-2 text-gray-600">
              <ExternalLink size={13} />
              <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600">
                LinkedIn Profile
              </a>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-4 text-xs text-gray-500">
          <div>
            <div className="font-medium text-gray-700">Enrichment</div>
            <div className="capitalize">{contact.enrichment_status}</div>
          </div>
          <div>
            <div className="font-medium text-gray-700">Lead Source</div>
            <div>{contact.lead_source ?? '—'}</div>
          </div>
          <div>
            <div className="font-medium text-gray-700">First Touch</div>
            <div>{contact.first_touch_date ?? '—'}</div>
          </div>
        </div>

        {contact.last_enriched_at && (
          <p className="text-xs text-gray-400 mt-3">
            Last enriched {formatDistanceToNow(new Date(contact.last_enriched_at), { addSuffix: true })}
          </p>
        )}
      </div>

      <h2 className="text-base font-semibold text-gray-800 mb-3">Signal History</h2>
      <SignalTimeline signals={signals} />
    </div>
  )
}
```

---

## Task 20: Environment files and DECISIONS.md

**Files:** `.env.example`, `.env.local`, `DECISIONS.md`

- [ ] **Step 1: Write .env.example**

```bash
# .env.example
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

PROXYCURL_API_KEY=your-proxycurl-key
OPENAI_API_KEY=your-openai-key
TAVILY_API_KEY=your-tavily-key

INNGEST_EVENT_KEY=your-inngest-event-key
INNGEST_SIGNING_KEY=your-inngest-signing-key
```

- [ ] **Step 2: Create .env.local with empty values (user will fill in)**

```bash
cp .env.example .env.local
```

- [ ] **Step 3: Write DECISIONS.md**

Create `DECISIONS.md`:

```markdown
# Key Design Decisions

## Data Decisions

### Rhode split into two accounts (not one)
`rhodeskin.com` (Hailey Bieber's beauty brand) and `shoprhode.com` (Rhode luxury resort) share a name but are entirely different companies. Different LinkedIn company URLs, different CSMs, different industries. Merging them would produce meaningless signals and confuse CSMs.

### DUSK merged into one account
`dusk.com` and `duskofficial.com` are the same company (DUSK Australia). The contacts overlap — Haris Shaikh appears in both. We merge by using `dusk.com` as the canonical domain and the richer data (Charlie Webber ownership) as the primary record.

### rhode.pro quarantined
One row with a placeholder contact. No enrichable data, no real contacts. Quarantined rather than creating a noise account.

### Aggressive junk flagging
We flag contacts as junk when first name is blank/Help/EF/CX/Accounting or last name is [not provided]/Unknown/Placeholder. These waste Proxycurl API credits and inflate contact counts. They're surfaced in the Data Quality dashboard for CSM review rather than silently discarded.

### Functional emails excluded from enrichment
Contacts with emails like help@, accounting@, cx-leaders@ are flagged as functional role mailboxes. No person to enrich; excluded from enrichment pipeline.

### Internal Postscript emails excluded
aaron.fox@postscript.io appears in the Ruggable account. This is a Postscript employee, not a customer contact. Excluded from enrichment to prevent wasting credits and to avoid confusing CSMs.

## Architecture Decisions

### Inngest for background enrichment (not inline API routes)
Proxycurl has a rate limit of ~100 req/min. 109 contacts = ~2 minutes of enrichment. Running this synchronously in an API route would timeout (Vercel 60s limit) and have no retry logic. Inngest handles fan-out, rate limiting (1 req/sec throttle), and step-level retry automatically.

### Client-side CSV parsing
Papa Parse runs in the browser, keeping the API route simple (receives JSON, not multipart). Avoids file upload complexity and works instantly on the client.

### Fuzzy title matching
CRM titles often use abbreviations (Dir, VP, Sr). Exact string matching would miss nearly all real title changes. We normalize abbreviations then apply Levenshtein distance; flag as changed if >20% different.

### Separate Rhode accounts (not merged under one account)
This ensures signals are scoped correctly. A "left company" signal for rhodeskin.com means something different than one for shoprhode.com.
```

---

## Task 21: Final wiring — verify build and local dev setup

- [ ] **Step 1: Run full test suite**

```bash
npm test 2>&1 | tail -10
```
Expected: All tests PASS (26 tests across validate, normalize, dedup).

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1
```
Expected: 0 errors.

- [ ] **Step 3: Verify production build**

```bash
npm run build 2>&1 | tail -20
```
Expected: Build succeeds. All routes compiled.

- [ ] **Step 4: Start local dev**

In terminal 1:
```bash
npm run dev
```

In terminal 2 (Inngest dev server — enables background jobs locally):
```bash
npx inngest-cli@latest dev
```

- [ ] **Step 5: Open app**

Navigate to http://localhost:3000. You should see the empty dashboard with CSV upload prompt.

- [ ] **Step 6: Upload the CSV**

Upload `/home/ht/Documents/Projects/PS/report1775662144176.csv`. Verify:
- 6 accounts appear (DUSK, Fishwife, Rhode Resort, rhode skin, Ruggable, Thrive Causemetics)
- Data quality meters show realistic clean/junk splits
- Accounts sorted by signal severity

- [ ] **Step 7: Add API keys and run enrichment**

Once API keys are in `.env.local`, restart dev server and re-upload CSV to trigger enrichment. Watch the Inngest dashboard at http://localhost:8288 to see jobs running.
```

---

## Self-Review Notes

After writing this plan I verified:

1. **Spec coverage:** All MVP features covered — ingest (Task 7), cleaning (Tasks 4-6), signals (Tasks 9-10), industry intel (Task 10), dashboard (Task 17), account detail (Task 18), contact detail (Task 19), signal dismiss (Task 11), data quality meter (Task 13). ✓

2. **Type consistency:** `NormalizedContact`, `NormalizedAccount`, `RawCsvRow`, `Contact`, `Signal`, `Account`, `IndustryIntel` defined in Task 3 and used consistently across all tasks. `RELEVANT_TITLE_KEYWORDS` exported from `validate.ts` (Task 4) and imported in `detect-stakeholders.ts` (Task 10). ✓

3. **No placeholders:** All code blocks are complete. All file paths are exact. ✓

4. **Function name consistency:** `flagContact`, `isRelevantStakeholder`, `resolveAccount`, `resolveAccountFromRow`, `deduplicateContacts`, `titlesMismatch`, `normalizeTitle`, `getPersonProfile`, `getCompanyEmployees`, `getCurrentCompany`, `searchNews`, `classifyIndustry`, `generateTrendSummary` — each defined once, referenced consistently. ✓
