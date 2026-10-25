// Called by a database webhook on event_submissions (insert and update). Emails Nico about new
// submissions and the organiser about decisions, through Resend.
//
// Secrets (Edge Functions > Secrets): RESEND_API_KEY, NOTIFY_EMAIL, WEBHOOK_SECRET.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { decisionEmail, type Email, reviewEmail, type Submission } from './emails.ts'

type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: Submission | null
  old_record: Submission | null
}

const FROM = 'Swim Events <noreply@swim-events.com>'
const REPLY_TO = 'info@proswimworkouts.com'

const env = (name: string): string => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing secret ${name}`)
  return value
}

const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function send(to: string, email: Email): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject: email.subject, text: email.text }),
  })
  if (!response.ok) throw new Error(`Resend answered ${response.status}: ${await response.text()}`)
}

async function emailOf(userId: string): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId)
  if (error) throw error
  return data.user?.email ?? null
}

async function onNewSubmission(submission: Submission): Promise<void> {
  if (!submission.user_id || submission.status !== 'pending') return
  const email = await emailOf(submission.user_id)
  const [{ data: profile }, { count }] = await Promise.all([
    supabase.from('profiles').select('organisation').eq('id', submission.user_id).maybeSingle(),
    supabase
      .from('event_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', submission.user_id)
      .eq('status', 'approved'),
  ])
  const projectRef = new URL(env('SUPABASE_URL')).hostname.split('.')[0]
  const today = new Date().toISOString().slice(0, 10)
  await send(
    env('NOTIFY_EMAIL'),
    reviewEmail(
      submission,
      { email: email ?? 'unknown', organisation: profile?.organisation ?? null, approvedBefore: count ?? 0 },
      today,
      `https://supabase.com/dashboard/project/${projectRef}/editor`,
    ),
  )
}

async function onDecision(submission: Submission, before: Submission): Promise<void> {
  if (before.status !== 'pending' || submission.status === before.status || !submission.user_id) return
  const email = decisionEmail(submission)
  if (!email) return
  const address = await emailOf(submission.user_id)
  if (address) await send(address, email)
}

Deno.serve(async (request) => {
  // The webhook sends this header; anyone else calling the function is turned away
  if (request.headers.get('x-webhook-secret') !== env('WEBHOOK_SECRET')) {
    return new Response('Forbidden', { status: 403 })
  }

  const payload = (await request.json()) as WebhookPayload
  if (payload.table !== 'event_submissions' || !payload.record) return new Response('Ignored')

  try {
    if (payload.type === 'INSERT') await onNewSubmission(payload.record)
    if (payload.type === 'UPDATE' && payload.old_record) await onDecision(payload.record, payload.old_record)
  } catch (error) {
    console.error(error)
    return new Response('Failed', { status: 500 })
  }
  return new Response('OK')
})
