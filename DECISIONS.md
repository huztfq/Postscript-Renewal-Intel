# Key Design Decisions

## Data Decisions

### Rhode split into two accounts (not one)
`rhodeskin.com` (Hailey Bieber's beauty brand) and `shoprhode.com` (Rhode luxury resort) share a name but are entirely different companies — different LinkedIn URLs, CSMs, and industries (beauty vs. hospitality). Merging them would produce meaningless signals and confuse CSMs.

### DUSK merged into one account
`dusk.com` and `duskofficial.com` are the same company (DUSK Australia). Contacts overlap — Haris Shaikh appears in both. We merge using `dusk.com` as the canonical domain, taking the richer owner/CSM data from the primary records.

### rhode.pro quarantined
One row with a placeholder contact. No enrichable data, no real contacts. Quarantined rather than creating a noisy empty account.

### Aggressive junk flagging
Contacts are flagged junk when first name is blank/Help/EF/CX/Accounting or last name is [not provided]/Unknown/Placeholder. These waste LinkedIn/Unipile quota and inflate contact counts. They're surfaced in the Data Quality dashboard for CSM review rather than silently discarded.

### Functional emails excluded from enrichment
Contacts with emails like `help@`, `accounting@`, `cx-leaders@` are role mailboxes with no person behind them. Excluded from enrichment.

### Internal Postscript emails excluded
`aaron.fox@postscript.io` appears in the Ruggable account. This is a Postscript employee, not a customer contact. Excluded from enrichment.

### Duplicate contact merging strategy
When multiple rows share a LinkedIn URL (e.g., Becca Millstein with 3 rows in Fishwife), or the same email within an account, they're merged into a single contact. Merge keeps the most complete record by field-level completeness score, and the earliest first_touch_date across all duplicates.

## Architecture Decisions

### Inngest for background enrichment (not inline API routes)
LinkedIn access via Unipile is subject to provider throttling. Running many profile lookups synchronously in an API route would risk timeouts (Vercel 60s limit) and lack retry logic. Inngest handles fan-out, throttling (1 req/sec), and step-level retry automatically.

### Client-side CSV parsing
Papa Parse runs in the browser, keeping the API route simple (receives JSON, not multipart). Avoids multipart file upload complexity and gives instant parse feedback.

### Fuzzy title matching
CRM titles use abbreviations (Dir → Director, VP → Vice President). Exact string matching misses real title changes. We normalize abbreviations and apply Levenshtein distance, flagging as changed if >20% different.

### Signal severity model
- **Critical**: Main POC or Champion contact left the company — CSM needs to act immediately
- **Warning**: Any stakeholder title/company change — worth investigating
- **Info**: New person detected at company, thought leader activity — awareness only

### CRM Health Score formula
`(clean_contacts / total_contacts) × 0.7 + (no_critical_signals ? 0.3 : 0)`
Displayed as a progress bar on each account card. Recomputed on every ingest.
