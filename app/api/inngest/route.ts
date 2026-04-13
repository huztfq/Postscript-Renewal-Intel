// app/api/inngest/route.ts
import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { enrichContact } from '@/lib/inngest/functions/enrich-contact'
import { detectStakeholders } from '@/lib/inngest/functions/detect-stakeholders'
import { generateIndustryIntel } from '@/lib/inngest/functions/industry-intel'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [enrichContact, detectStakeholders, generateIndustryIntel],
  // Stable Vercel alias so Inngest Cloud calls the right URL
  serveOrigin: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
})
