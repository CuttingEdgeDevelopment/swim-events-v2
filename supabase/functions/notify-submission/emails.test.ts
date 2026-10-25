// Run with `deno test supabase/functions/notify-submission`
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { daysUntil, decisionEmail, domainCheck, formatDates, reviewEmail, type Submission } from './emails.ts'

const submission: Submission = {
  id: '6b1f1c1e-0000-4000-8000-000000000001',
  user_id: '00000000-0000-0000-0000-00000000000a',
  kind: 'new',
  event_id: null,
  name: 'Basel Winter Meet',
  city: 'Basel',
  country: 'SUI',
  dateStart: '2026-11-14',
  dateEnd: '2026-11-15',
  link: 'https://www.scbasel.ch/winter-meet',
  note: 'Short course, 25 m pool.',
  organiser_role: 'Meet director',
  status: 'pending',
  review_note: null,
  created_at: '2026-10-25T18:00:00Z',
}

Deno.test('dates read like the site', () => {
  assertEquals(formatDates('2026-11-14', '2026-11-15'), '14–15 Nov 2026')
  assertEquals(formatDates('2026-11-14', '2026-11-14'), '14 Nov 2026')
  assertEquals(formatDates('2026-11-30', '2026-12-01'), '30 Nov – 1 Dec 2026')
  assertEquals(formatDates('2026-12-31', '2027-01-01'), '31 Dec 2026 – 1 Jan 2027')
  assertEquals(daysUntil('2026-11-14', '2026-10-25'), 20)
})

Deno.test('the email domain is compared with the event website', () => {
  assertStringIncludes(domainCheck('anna@scbasel.ch', 'https://www.scbasel.ch/meet'), 'matches')
  assertStringIncludes(domainCheck('anna@mail.scbasel.ch', 'https://scbasel.ch'), 'matches')
  assertStringIncludes(domainCheck('anna@gmail.com', 'https://scbasel.ch'), 'free email address')
  assertStringIncludes(domainCheck('anna@other.ch', 'https://scbasel.ch'), 'different')
  assertStringIncludes(domainCheck('anna@scbasel.ch', ''), 'no event website')
})

Deno.test('the review email has what Nico needs to check', () => {
  const email = reviewEmail(
    submission,
    { email: 'anna@scbasel.ch', organisation: 'SC Basel', approvedBefore: 2 },
    '2026-10-25',
    'https://supabase.com/dashboard/project/abc/editor',
  )
  assertEquals(email.subject, 'New event: Basel Winter Meet')
  for (const part of [
    '14–15 Nov 2026 (starts in 20 days)',
    'Meet director',
    'SC Basel',
    'matches',
    'approved before: 2',
    'Short course',
  ]) {
    assertStringIncludes(email.text, part)
  }
  assertEquals(
    reviewEmail(
      { ...submission, kind: 'claim', event_id: 900 },
      { email: 'a@b.ch', organisation: null, approvedBefore: 0 },
      '2026-10-25',
      '',
    ).subject,
    'Claim: Basel Winter Meet',
  )
})

Deno.test('organisers hear about approvals and rejections only', () => {
  assertEquals(decisionEmail({ ...submission, status: 'approved' })?.subject, 'Your event is listed: Basel Winter Meet')
  assertEquals(
    decisionEmail({ ...submission, kind: 'claim', status: 'approved' })?.subject,
    "You're linked to Basel Winter Meet",
  )
  const rejected = decisionEmail({ ...submission, status: 'rejected', review_note: 'Already listed' })
  assertStringIncludes(rejected?.text ?? '', 'Reason: Already listed')
  assertEquals(decisionEmail({ ...submission, status: 'spam' }), null)
  assertEquals(decisionEmail({ ...submission, status: 'withdrawn' }), null)
})
