-- Accounts and event submissions, phase 1 (see event-submissions/PLAN.md in the project files).
--
-- Organisers sign in (Supabase Auth, email code) and submit competitions, or claim events
-- that are already listed. Submissions wait in a private table until Nico sets their status
-- in the table editor; approving one copies it into `events` (or, for a claim, links the
-- event to the organiser). Everything here is new, apart from three columns on `events`,
-- so the site keeps working before and after this runs.
--
-- Supabase gives `anon` and `authenticated` every privilege on new tables, and row-level
-- security is what protects them. Every new table gets RLS, and the privileges are cut back
-- to what the pages need.

-- 1. Limits per account level, edited by Nico in the table editor (private)
create table public.submission_limits (
  level text primary key,
  max_waiting int not null check (max_waiting >= 0),
  max_per_day int not null check (max_per_day >= 0)
);

comment on table public.submission_limits is 'How many submissions an account may have waiting for review, and send per 24 hours';
comment on column public.submission_limits.max_waiting is 'Submissions waiting for review at once';
comment on column public.submission_limits.max_per_day is 'Submissions sent in the last 24 hours, whatever their status';

insert into public.submission_limits (level, max_waiting, max_per_day) values
  ('standard', 3, 5),
  ('trusted', 10, 15);

alter table public.submission_limits enable row level security;
revoke all on public.submission_limits from anon, authenticated;

-- 2. Site-wide settings, one row (private)
create table public.settings (
  id boolean primary key default true check (id),
  submissions_open boolean not null default true
);

comment on table public.settings is 'Site-wide switches; there is only ever one row';
comment on column public.settings.submissions_open is 'Switch off to pause all new submissions and claims';

insert into public.settings default values;

alter table public.settings enable row level security;
revoke all on public.settings from anon, authenticated;

-- 3. Profiles: one per account, created on sign-up (private)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  organisation text check (char_length(organisation) <= 120),
  terms_accepted_at timestamptz,
  level text not null default 'standard' references public.submission_limits (level),
  blocked boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per account; level and blocked are set by Nico';
comment on column public.profiles.level is 'Which row of submission_limits applies';
comment on column public.profiles.blocked is 'Set when a submission is marked as spam; blocks new submissions';

alter table public.profiles enable row level security;
create policy "Own profile is readable" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "Own profile is editable" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, organisation, terms_accepted_at) on public.profiles to authenticated;

-- A leftover from Supabase's user management starter: it writes `full_name` and `avatar_url`
-- into a `profiles` table that never existed, so every sign-up would fail. Replaced below.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create function public.create_profile() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end
$$;

revoke execute on function public.create_profile() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_profile();

-- 4. Events: status for phase 3, timestamps, and read access for signed-in visitors
alter table public.events
  add column status text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'postponed')),
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

comment on column public.events.status is 'scheduled, cancelled or postponed; the site reads it from phase 3';

create function public.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

revoke execute on function public.touch_updated_at() from public, anon, authenticated;

create trigger events_touch_updated_at
  before update on public.events
  for each row execute function public.touch_updated_at();

-- The submit and account pages load the event list with a signed-in session, which uses the
-- `authenticated` role. Everyone only ever reads events and countries; changes go through the
-- dashboard or the approval trigger, so the unused write privileges are taken away too.
grant select on public.events, public.countries to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.events, public.countries from anon, authenticated;

-- 5. Who owns which event (private; nothing private ever goes on `events`)
create table public.event_owners (
  event_id bigint references public.events (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

comment on table public.event_owners is 'Organisers linked to an event, by an approved submission or claim';

create index on public.event_owners (user_id);

alter table public.event_owners enable row level security;
create policy "Own events are listed" on public.event_owners
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.event_owners from anon, authenticated;
grant select on public.event_owners to authenticated;

-- 6. Submissions (private)
create table public.event_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  kind text not null default 'new' check (kind in ('new', 'claim', 'correction', 'cancellation')),
  event_id bigint references public.events (id) on delete set null,
  name text not null check (char_length(name) between 3 and 120),
  city text not null check (char_length(city) between 1 and 80),
  country text not null references public.countries (ioc),
  "dateStart" date not null,
  "dateEnd" date not null,
  link text not null default '' check (link = '' or (link ~ '^https?://' and char_length(link) <= 500)),
  note text check (char_length(note) <= 1000),
  organiser_role text not null check (char_length(organiser_role) between 2 and 120),
  organiser_confirmed boolean not null check (organiser_confirmed),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'spam', 'withdrawn')),
  review_note text check (char_length(review_note) <= 1000),
  reviewed_at timestamptz,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  check ("dateEnd" >= "dateStart" and "dateEnd" <= "dateStart" + 31)
);

comment on table public.event_submissions is 'Events sent by organisers; set status to approved, rejected or spam to decide';
comment on column public.event_submissions.kind is 'new: a new event; claim: link an existing event to the organiser';
comment on column public.event_submissions.organiser_role is 'How the submitter is involved, e.g. Meet director, SC Basel';
comment on column public.event_submissions.review_note is 'Shown to the organiser, e.g. why it was not accepted';
comment on column public.event_submissions.idempotency_key is 'Set by the form, so a retried send is not stored twice';

create index on public.event_submissions (status, created_at);
create index on public.event_submissions (user_id, created_at);
create index on public.event_submissions (event_id);

alter table public.event_submissions enable row level security;
create policy "Own submissions are readable" on public.event_submissions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Signed-in users can submit" on public.event_submissions
  for insert to authenticated with check (user_id = (select auth.uid()) and status = 'pending');
create policy "Own pending submissions can be withdrawn" on public.event_submissions
  for update to authenticated using (user_id = (select auth.uid()) and status = 'pending')
  with check (user_id = (select auth.uid()) and status = 'withdrawn');

revoke all on public.event_submissions from anon, authenticated;
grant select on public.event_submissions to authenticated;
grant insert (kind, event_id, name, city, country, "dateStart", "dateEnd", link, note, organiser_role,
  organiser_confirmed, idempotency_key) on public.event_submissions to authenticated;
grant update (status) on public.event_submissions to authenticated;

-- 7. Checks on every new submission. In the database, so calling the API directly can't skip
-- them. Error messages are codes the form turns into sentences; the detail is for the logs.
create function public.check_event_submission() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account public.profiles;
  limits public.submission_limits;
  waiting int;
  last_day int;
  listed public.events;
begin
  if not (select s.submissions_open from public.settings s) then
    raise exception 'submissions_closed' using detail = 'Submissions are switched off in settings';
  end if;

  select * into account from public.profiles p where p.id = new.user_id;
  if not found then
    raise exception 'no_profile' using detail = 'The account has no profile';
  end if;
  if account.blocked then
    raise exception 'account_blocked' using detail = 'The account is blocked';
  end if;

  select * into limits from public.submission_limits l where l.level = account.level;
  select
    count(*) filter (where s.status = 'pending'),
    count(*) filter (where s.created_at > now() - interval '24 hours')
  into waiting, last_day
  from public.event_submissions s
  where s.user_id = new.user_id;
  if waiting >= limits.max_waiting then
    raise exception 'too_many_waiting' using detail = format('%s waiting, limit %s', waiting, limits.max_waiting);
  end if;
  if last_day >= limits.max_per_day then
    raise exception 'daily_limit' using detail = format('%s in 24 hours, limit %s', last_day, limits.max_per_day);
  end if;

  if new.kind = 'new' then
    if new.event_id is not null then
      raise exception 'invalid_submission' using detail = 'A new event has no event_id';
    end if;
    -- the form asks for 3 days in the visitor's own date; one day of slack for time zones
    if new."dateStart" < current_date + 2 then
      raise exception 'date_too_soon' using detail = format('Starts %s', new."dateStart");
    end if;
    if new."dateStart" > current_date + interval '3 years' then
      raise exception 'date_too_far' using detail = format('Starts %s', new."dateStart");
    end if;
  elsif new.kind = 'claim' then
    select * into listed from public.events e where e.id = new.event_id;
    if not found or listed.status = 'cancelled' or listed."dateEnd" < current_date then
      raise exception 'event_not_claimable' using detail = format('Event %s', new.event_id);
    end if;
    if exists (select 1 from public.event_owners o where o.event_id = new.event_id and o.user_id = new.user_id) then
      raise exception 'already_owner' using detail = format('Event %s', new.event_id);
    end if;
    if exists (
      select 1 from public.event_submissions s
      where s.event_id = new.event_id and s.user_id = new.user_id and s.kind = 'claim' and s.status = 'pending'
    ) then
      raise exception 'claim_waiting' using detail = format('Event %s', new.event_id);
    end if;
    -- a claim is about the listed event as it is, whatever the form sent
    new.name := listed.name;
    new.city := listed.city;
    new.country := listed.country;
    new."dateStart" := listed."dateStart";
    new."dateEnd" := listed."dateEnd";
    new.link := listed.link;
  else
    raise exception 'invalid_submission' using detail = format('Kind %s is not open yet', new.kind);
  end if;

  -- trimmed, without control characters (the note keeps its line breaks)
  new.name := btrim(regexp_replace(new.name, '[[:cntrl:]]', '', 'g'));
  new.city := btrim(regexp_replace(new.city, '[[:cntrl:]]', '', 'g'));
  new.link := btrim(regexp_replace(new.link, '[[:cntrl:]]', '', 'g'));
  new.organiser_role := btrim(regexp_replace(new.organiser_role, '[[:cntrl:]]', '', 'g'));
  new.note := nullif(btrim(regexp_replace(new.note, '[\x01-\x09\x0b-\x1f\x7f]', '', 'g')), '');

  new.status := 'pending';
  new.review_note := null;
  new.reviewed_at := null;
  new.created_at := now();
  return new;
end
$$;

revoke execute on function public.check_event_submission() from public, anon, authenticated;

-- Before-triggers run in name order: this one first, then the country clean-up
create trigger event_submissions_check
  before insert on public.event_submissions
  for each row execute function public.check_event_submission();

create trigger event_submissions_normalize_country
  before insert or update of country, city on public.event_submissions
  for each row execute function public.normalize_event_country();

-- 8. Deciding: Nico sets the status in the table editor
create function public.decide_event_submission() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_event_id bigint;
begin
  if new.status = old.status then
    return new;
  end if;
  if old.status <> 'pending' then
    raise exception 'already_decided' using detail = format('Status is %s', old.status);
  end if;

  if new.status = 'approved' then
    if new.kind = 'new' then
      insert into public.events (name, city, country, "dateStart", "dateEnd", link)
      values (new.name, new.city, new.country, new."dateStart", new."dateEnd", new.link)
      returning id into new_event_id;
      new.event_id := new_event_id;
    elsif new.kind = 'claim' then
      if new.event_id is null then
        raise exception 'event_not_claimable' using detail = 'The claimed event no longer exists';
      end if;
    else
      raise exception 'invalid_submission' using detail = format('Kind %s is not open yet', new.kind);
    end if;
    if new.user_id is not null then
      insert into public.event_owners (event_id, user_id) values (new.event_id, new.user_id)
      on conflict do nothing;
    end if;
  elsif new.status = 'spam' and new.user_id is not null then
    update public.profiles set blocked = true where id = new.user_id;
  end if;

  if new.status in ('approved', 'rejected', 'spam') then
    new.reviewed_at := now();
  end if;
  return new;
end
$$;

revoke execute on function public.decide_event_submission() from public, anon, authenticated;

create trigger event_submissions_decide
  before update of status on public.event_submissions
  for each row execute function public.decide_event_submission();

-- 9. "Delete my account" on the Account page. Profile and ownership go with the account;
-- submissions stay without the link to it; published events stay on the site.
create function public.delete_my_account() returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  delete from auth.users where id = auth.uid();
end
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
