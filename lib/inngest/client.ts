// lib/inngest/client.ts
import { Inngest } from 'inngest'

export const inngest = new Inngest({
  id: 'renewal-intel',
  // In local dev (`INNGEST_DEV=1`) the SDK sends to http://localhost:8288 automatically.
  // In production the SDK sends to https://inn.gs using INNGEST_EVENT_KEY.
  // No extra config needed; env vars drive the behaviour.
})
