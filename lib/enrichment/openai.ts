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
    messages: [{ role: 'user', content: `Classify this e-commerce company into a short industry vertical (max 5 words).\nCompany: ${companyName}\nWebsite: ${website}\nReply with only the industry label, nothing else.` }],
    max_tokens: 20,
  })
  return completion.choices[0]?.message?.content?.trim() ?? 'E-commerce / DTC'
}

export async function generateTrendSummary(companyName: string, industry: string, newsSnippets: string[]): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return `${companyName} operates in the ${industry} space. No trend data available — add OPENAI_API_KEY to enable.`
  }
  const snippets = newsSnippets.slice(0, 5).join('\n\n')
  const completion = await getClient().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: `You are a customer success analyst. Write a 2-3 sentence industry trend summary for a CSM preparing for a renewal with ${companyName} (${industry}).\n\nRecent news context:\n${snippets}\n\nFocus on: retention marketing trends, DTC challenges, and anything relevant to SMS/email marketing spend. Be specific and concise.` }],
    max_tokens: 150,
  })
  return completion.choices[0]?.message?.content?.trim() ?? ''
}

const TITLE_ABBREVS: [RegExp, string][] = [
  [/\bdir\b/gi, 'director'], [/\bvp\b/gi, 'vice president'], [/\bsr\b/gi, 'senior'],
  [/\bmgr\b/gi, 'manager'], [/\bmktg\b/gi, 'marketing'], [/\bcmo\b/gi, 'chief marketing officer'],
  [/\bceo\b/gi, 'chief executive officer'], [/\bcoo\b/gi, 'chief operating officer'],
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
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

export function titlesMismatch(crmTitle: string, linkedinTitle: string): boolean {
  if (!crmTitle || !linkedinTitle) return false
  const a = normalizeTitle(crmTitle)
  const b = normalizeTitle(linkedinTitle)
  if (a === b) return false
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return false
  return levenshtein(a, b) / maxLen > 0.2
}
