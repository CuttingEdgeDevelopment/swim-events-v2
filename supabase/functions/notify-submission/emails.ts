// The emails sent about submissions: one to Nico for every new submission, and one to the
// organiser when a submission is approved or rejected. Plain text only, so they read the same
// in every mail program and screen reader.

export type Submission = {
  id: string
  user_id: string | null
  kind: 'new' | 'claim' | 'correction' | 'cancellation'
  event_id: number | null
  name: string
  city: string
  country: string
  dateStart: string
  dateEnd: string
  link: string
  note: string | null
  organiser_role: string
  status: 'pending' | 'approved' | 'rejected' | 'spam' | 'withdrawn'
  review_note: string | null
  created_at: string
}

export type Organiser = {
  email: string
  organisation: string | null
  approvedBefore: number
}

export type Email = { subject: string; text: string }

const SITE = 'https://swim-events.com'
const SIGNATURE =
  '\n--\nSwim Events (swim-events.com), run by ProSwimWorkouts\nReply to this email if you have any questions.'

// Addresses anyone can create, so a match with the event website proves nothing
const FREE_PROVIDERS = [
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'gmx.ch',
  'gmx.de',
  'gmx.net',
  'gmx.at',
  'web.de',
  'bluewin.ch',
  'proton.me',
  'protonmail.com',
  'hey.com',
  'yandex.com',
  'mail.com',
  'zoho.com',
]

/** "14–15 Nov 2026", or "14 Nov 2026" for a one-day event. */
export function formatDates(start: string, end: string): string {
  const format = (date: string, parts: Intl.DateTimeFormatOptions) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { ...parts, timeZone: 'UTC' })
  if (start === end) return format(start, { day: 'numeric', month: 'short', year: 'numeric' })
  const [startYear, startMonth] = start.split('-')
  const [endYear, endMonth] = end.split('-')
  if (startYear === endYear && startMonth === endMonth) {
    return `${format(start, { day: 'numeric' })}–${format(end, { day: 'numeric', month: 'short', year: 'numeric' })}`
  }
  if (startYear === endYear) {
    return `${format(start, { day: 'numeric', month: 'short' })} – ${format(end, { day: 'numeric', month: 'short', year: 'numeric' })}`
  }
  return `${format(start, { day: 'numeric', month: 'short', year: 'numeric' })} – ${format(end, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

/** Whole days from `today` to `date`, both YYYY-MM-DD. */
export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
}

/** How the submitter's email address relates to the event website, as a hint for checking. */
export function domainCheck(email: string, link: string): string {
  const emailDomain = email.split('@').pop()?.toLowerCase() ?? ''
  if (FREE_PROVIDERS.includes(emailDomain)) return `free email address (${emailDomain}), check another way`
  if (!link) return `${emailDomain}, no event website to compare`

  let siteDomain: string
  try {
    siteDomain = new URL(link).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return `${emailDomain}, event website can't be read`
  }
  const matches =
    emailDomain === siteDomain || emailDomain.endsWith(`.${siteDomain}`) || siteDomain.endsWith(`.${emailDomain}`)
  return matches
    ? `matches the event website (${siteDomain})`
    : `${emailDomain}, different from the event website (${siteDomain})`
}

/** The email to Nico about a new submission or claim. */
export function reviewEmail(submission: Submission, organiser: Organiser, today: string, dashboardUrl: string): Email {
  const isClaim = submission.kind === 'claim'
  const days = daysUntil(submission.dateStart, today)
  const lines = [
    isClaim
      ? 'An organiser wants to claim an event that is already listed.'
      : 'A new competition is waiting for review.',
    '',
    `Event: ${submission.name}`,
    `Place: ${submission.city}, ${submission.country}`,
    `Dates: ${formatDates(submission.dateStart, submission.dateEnd)} (starts in ${days} ${days === 1 ? 'day' : 'days'})`,
    `Website: ${submission.link || 'none'}`,
  ]
  if (isClaim) lines.push(`Listed event id: ${submission.event_id}`)
  if (submission.note) lines.push('', 'Note from the organiser:', submission.note)
  lines.push(
    '',
    `From: ${organiser.email}`,
    `Role: ${submission.organiser_role}`,
    `Organisation (profile): ${organiser.organisation || 'not given'}`,
    `Email domain: ${domainCheck(organiser.email, submission.link)}`,
    `Events approved before: ${organiser.approvedBefore}`,
    '',
    'To decide, open event_submissions in the table editor and set status to approved, rejected or spam:',
    dashboardUrl,
    `Submission id: ${submission.id}`,
  )
  return {
    subject: `${isClaim ? 'Claim' : 'New event'}: ${submission.name}`,
    text: lines.join('\n'),
  }
}

/** The email to the organiser once their submission is decided, or null when none is sent. */
export function decisionEmail(submission: Submission): Email | null {
  const event = `${submission.name} (${formatDates(submission.dateStart, submission.dateEnd)}, ${submission.city})`

  if (submission.status === 'approved' && submission.kind === 'claim') {
    return {
      subject: `You're linked to ${submission.name}`,
      text: [
        `We've confirmed that you organise ${event}.`,
        'The event is now linked to your account, and you can see it on your Account page.',
        reviewNote(submission),
        `${SITE}/account`,
        SIGNATURE,
      ]
        .filter(Boolean)
        .join('\n\n'),
    }
  }
  if (submission.status === 'approved') {
    return {
      subject: `Your event is listed: ${submission.name}`,
      text: [`Good news: ${event} is now listed on Swim Events.`, reviewNote(submission), SITE, SIGNATURE]
        .filter(Boolean)
        .join('\n\n'),
    }
  }
  if (submission.status === 'rejected') {
    return {
      subject: `We couldn't accept ${submission.name}`,
      text: [
        submission.kind === 'claim'
          ? `We couldn't link ${event} to your account.`
          : `We couldn't add ${event} to Swim Events.`,
        submission.review_note ? `Reason: ${submission.review_note}` : '',
        'If you think this is a mistake, or you can show that you organise the event, just reply to this email.',
        SIGNATURE,
      ]
        .filter(Boolean)
        .join('\n\n'),
    }
  }
  // spam and withdrawn get no email
  return null
}

function reviewNote(submission: Submission): string {
  return submission.review_note ? `A note from us: ${submission.review_note}` : ''
}
