// lib/inngest/functions/industry-intel.ts
import { type GetStepTools } from 'inngest'
import { inngest } from '../client'
import { supabaseAdmin } from '@/lib/supabase'
import { searchNews, type TavilyResult } from '@/lib/enrichment/tavily'
import { classifyIndustry, generateTrendSummary } from '@/lib/enrichment/openai'

type StepTools = GetStepTools<typeof inngest>

export const generateIndustryIntel = inngest.createFunction(
  { id: 'generate-industry-intel', triggers: [{ event: 'renewal/account.industry-intel' }] },
  async ({ event, step }: { event: { data: { accountId: string } }; step: StepTools }) => {
    const { accountId } = event.data

    const account = await step.run('fetch-account', async () => {
      const { data } = await supabaseAdmin.from('accounts').select('id, name, website, industry').eq('id', accountId).single()
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

    const news = await step.run('fetch-news', () => searchNews(`${account.name} ecommerce news 2025`, 5))

    const trendSummary = await step.run('generate-summary', async () => {
      const snippets = (news as TavilyResult[]).map((r: TavilyResult) => `${r.title}: ${r.content.slice(0, 300)}`)
      return generateTrendSummary(account.name, industry, snippets)
    })

    await step.run('store-intel', async () => {
      await supabaseAdmin.from('industry_intel').upsert(
        {
          account_id: accountId,
          industry,
          trend_summary: trendSummary,
          sources: (news as TavilyResult[]).map((r: TavilyResult) => ({ url: r.url, title: r.title })),
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'account_id' },
      )
    })

    return { accountId, industry }
  },
)
