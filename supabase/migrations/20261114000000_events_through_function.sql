-- Events are loaded through the `events` Edge Function instead of straight from the table.
--
-- Apply this only after the site version that calls the function is live: from then on visitors
-- can't read `events` directly. Signed-in organisers still see the events they own (account page),
-- and every database check on events and submissions keeps working.
--
-- Rollback:
--   drop policy if exists "Owners can read their events" on public.events;
--   create policy "Enable read access for all users" on public.events for select using (true);
--   grant select on public.events to anon;

-- 1. Rate limit settings, changeable in the table editor without a deploy
alter table public.settings
  add column events_rate_limit integer not null default 30 check (events_rate_limit >= 0),
  add column events_rate_window_minutes integer not null default 5 check (events_rate_window_minutes > 0);

comment on column public.settings.events_rate_limit is
  'Requests per visitor and window to the events function; 0 switches the limit off';
comment on column public.settings.events_rate_window_minutes is 'Length of the events rate limit window';

-- 2. Counters, keyed by a salted hash of the visitor's IP (never the IP itself), kept briefly
create table public.events_rate_limits (
  visitor text primary key,
  window_start timestamptz not null default now(),
  requests integer not null default 1
);

comment on table public.events_rate_limits is 'Request counters for the events function; rows only live for a few windows';

alter table public.events_rate_limits enable row level security;
revoke all on public.events_rate_limits from anon, authenticated;

-- Counts one request and says whether the visitor is still within the limit.
create function public.events_rate_check(visitor_key text) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_requests integer;
  window_length interval;
  counted integer;
begin
  select s.events_rate_limit, make_interval(mins => s.events_rate_window_minutes)
    into max_requests, window_length
  from public.settings s;

  if coalesce(max_requests, 0) = 0 then
    return true;
  end if;

  insert into public.events_rate_limits as l (visitor) values (visitor_key)
  on conflict (visitor) do update set
    requests = case when l.window_start <= now() - window_length then 1 else l.requests + 1 end,
    window_start = case when l.window_start <= now() - window_length then now() else l.window_start end
  returning l.requests into counted;

  -- Forget visitors whose window ended a while ago
  delete from public.events_rate_limits where window_start < now() - window_length * 3;

  return counted <= max_requests;
end
$$;

revoke execute on function public.events_rate_check(text) from public, anon, authenticated;
grant execute on function public.events_rate_check(text) to service_role;

-- 3. Close direct reads on events
drop policy if exists "Enable read access for all users" on public.events;
revoke select on public.events from anon;

create policy "Owners can read their events" on public.events
  for select to authenticated
  using (exists (
    select 1 from public.event_owners o
    where o.event_id = events.id and o.user_id = (select auth.uid())
  ));
