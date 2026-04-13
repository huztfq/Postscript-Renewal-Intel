// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

// Use empty-string fallbacks so Next.js build doesn't throw when env vars
// aren't present (e.g. on Vercel before they're configured). Any actual
// request made without real values will return a Supabase auth error.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

// Browser client (anon key) — use in Client Components
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server client (service role) — use in API routes and Server Components
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
