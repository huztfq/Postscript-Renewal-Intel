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
