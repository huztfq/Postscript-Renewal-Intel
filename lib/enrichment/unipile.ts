// lib/enrichment/unipile.ts — LinkedIn via Unipile (connected account)
// Docs: https://developer.unipile.com/reference

/** Same shape as former Proxycurl mapping; kept for enrich-contact / signals. */
export interface EnrichmentPerson {
  full_name: string | null
  occupation: string | null
  experiences: Array<{
    company: string | null
    title: string | null
    ends_at: null | { day: number; month: number; year: number }
  }> | null
  follower_count: number | null
}

export interface LinkedInEmployee {
  profile_url: string
  first_name: string
  last_name: string
  summary: string | null
}

type UnipileLinkedInProfile = {
  provider?: string
  first_name?: string | null
  last_name?: string | null
  headline?: string | null
  follower_count?: number | null
  connections_count?: number | null
  work_experience?: Array<{
    position?: string | null
    company?: string | null
    current?: boolean | null
    end?: string | null
  }> | null
}

type CompanyProfileResponse = {
  object?: string
  id?: string
}

type LinkedInSearchResponse = {
  object?: string
  items?: Array<{
    type?: string
    first_name?: string
    last_name?: string
    headline?: string | null
    public_profile_url?: string | null
    profile_url?: string | null
    public_identifier?: string | null
  }>
}

function getConfig() {
  const baseUrl = (process.env.UNIPILE_API_URL ?? process.env.UNIPILE_DSN ?? '').replace(/\/$/, '')
  const accessToken = process.env.UNIPILE_ACCESS_TOKEN ?? ''
  const accountId = process.env.UNIPILE_ACCOUNT_ID ?? ''
  return { baseUrl, accessToken, accountId }
}

function isConfigured(): boolean {
  const c = getConfig()
  return Boolean(c.baseUrl && c.accessToken && c.accountId)
}

function extractLinkedInPersonId(url: string): string | null {
  try {
    const u = new URL(url.trim())
    const host = u.hostname.replace(/^www\./, '')
    if (!host.endsWith('linkedin.com')) return null
    const segments = u.pathname.split('/').filter(Boolean)
    const i = segments.indexOf('in')
    if (i >= 0 && segments[i + 1]) {
      const slug = segments[i + 1].split('?')[0]
      return slug ? decodeURIComponent(slug) : null
    }
    return null
  } catch {
    return null
  }
}

function extractLinkedInCompanyId(url: string): string | null {
  try {
    const u = new URL(url.trim())
    const host = u.hostname.replace(/^www\./, '')
    if (!host.endsWith('linkedin.com')) return null
    const segments = u.pathname.split('/').filter(Boolean)
    const i = segments.indexOf('company')
    if (i >= 0 && segments[i + 1]) {
      return decodeURIComponent(segments[i + 1].split('?')[0])
    }
    return null
  } catch {
    return null
  }
}

async function unipileFetch<T>(method: 'GET' | 'POST', path: string, init?: { search?: URLSearchParams; body?: unknown }): Promise<T | null> {
  if (!isConfigured()) {
    console.warn('[unipile] Missing UNIPILE_API_URL, UNIPILE_ACCESS_TOKEN, or UNIPILE_ACCOUNT_ID — skipping')
    return null
  }
  const { baseUrl, accessToken, accountId } = getConfig()
  const qs = init?.search ?? new URLSearchParams()
  if (!qs.has('account_id')) qs.set('account_id', accountId)
  const url = `${baseUrl}${path}${qs.toString() ? `?${qs.toString()}` : ''}`
  const headers: Record<string, string> = {
    accept: 'application/json',
    'X-API-KEY': accessToken,
  }
  if (method === 'POST') headers['content-type'] = 'application/json'
  const res = await fetch(url, {
    method,
    headers,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Unipile ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

function mapProfileToPerson(raw: UnipileLinkedInProfile): EnrichmentPerson {
  const first = raw.first_name?.trim() ?? ''
  const last = raw.last_name?.trim() ?? ''
  const fullName = [first, last].filter(Boolean).join(' ') || null
  const experiences =
    raw.work_experience?.map(w => {
      const ended = w.current === false || (w.end != null && w.end !== '')
      return {
        company: w.company ?? null,
        title: w.position ?? null,
        ends_at: ended ? { day: 1, month: 1, year: 1970 } : null,
      }
    }) ?? null
  const followers = raw.follower_count ?? raw.connections_count ?? null
  return {
    full_name: fullName,
    occupation: raw.headline ?? null,
    experiences,
    follower_count: followers,
  }
}

export async function getPersonProfile(linkedinUrl: string): Promise<EnrichmentPerson | null> {
  const identifier = extractLinkedInPersonId(linkedinUrl)
  if (!identifier) return null
  const search = new URLSearchParams()
  search.append('linkedin_sections', 'experience')
  search.set('notify', 'false')
  const raw = await unipileFetch<UnipileLinkedInProfile>(
    'GET',
    `/api/v1/users/${encodeURIComponent(identifier)}`,
    { search },
  )
  if (!raw) return null
  return mapProfileToPerson(raw)
}

export async function getCompanyEmployees(companyLinkedinUrl: string, keywords: string[]): Promise<LinkedInEmployee[]> {
  const companyIdentifier = extractLinkedInCompanyId(companyLinkedinUrl)
  if (!companyIdentifier) return []

  const company = await unipileFetch<CompanyProfileResponse>(
    'GET',
    `/api/v1/linkedin/company/${encodeURIComponent(companyIdentifier)}`,
  )
  if (!company?.id) return []

  const titleFilter = keywords.map(k => k.trim()).filter(Boolean).join(' OR ')
  const search = new URLSearchParams()
  search.set('limit', '15')

  const data = await unipileFetch<LinkedInSearchResponse>('POST', '/api/v1/linkedin/search', {
    search,
    body: {
      api: 'classic',
      category: 'people',
      company: [company.id],
      ...(titleFilter ? { advanced_keywords: { title: titleFilter } } : {}),
    },
  })

  const items = data?.items ?? []
  return items
    .filter(item => (item.type ?? '').toString().toUpperCase() === 'PEOPLE')
    .map(item => {
      const profileUrl =
        item.public_profile_url ||
        item.profile_url ||
        (item.public_identifier ? `https://www.linkedin.com/in/${item.public_identifier}` : '')
      return {
        profile_url: profileUrl,
        first_name: item.first_name ?? '',
        last_name: item.last_name ?? '',
        summary: item.headline ?? null,
      }
    })
    .filter(e => e.profile_url)
}

export function getCurrentCompany(person: EnrichmentPerson): string | null {
  const current = person.experiences?.find(e => e.ends_at === null)
  return current?.company ?? null
}
