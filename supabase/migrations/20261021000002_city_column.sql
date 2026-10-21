-- Step 1 of trimming `location` to the city (see flags/DB-PLAN.md, final phase).
--
-- Adds `events.city` ("Basel"), filled from `location` ("Basel (SUI)", or the older
-- "HUN, Hungary, Budapest"). Only additions: `location` stays until the site reads
-- `city`, then a second migration drops it.

alter table public.events add column city text;

comment on column public.events.city is 'City (or venue town) the event takes place in, without the country';

-- Whenever an event is saved: a city typed as "Basel (SUI)" is split into the city and
-- the country (when the country is left empty), the country falls back to the code in
-- `location` while that column exists, and aliases are corrected ("mco" becomes "MON").
create or replace function public.normalize_event_country() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  place text := trim(coalesce(new.city, new.location));
  code text;
begin
  code := coalesce(
    substring(place from '\(([A-Za-z]{3})\)\s*$'),
    substring(place from '^([A-Za-z]{3}),')
  );
  new.city := coalesce(
    substring(place from '^(.+?)\s*\([A-Za-z]{3}\)\s*$'),
    substring(place from '^[A-Za-z]{3},\s*.+,\s*([^,]+?)\s*$'),
    place
  );
  new.country := upper(trim(coalesce(new.country, code)));
  new.country := coalesce(
    (select a.ioc from public.country_aliases a where a.alias = new.country),
    new.country
  );
  return new;
end
$$;

create or replace trigger events_normalize_country
  before insert or update of country, city on public.events
  for each row execute function public.normalize_event_country();

-- Fill every existing event through the trigger (keeps each country as it is)
update public.events set city = null where city is null;

do $$
begin
  if exists (select 1 from public.events where city is null or city = '') then
    raise exception 'events without a city: %',
      (select string_agg(id::text, ', ') from public.events where city is null or city = '');
  end if;
end
$$;

alter table public.events alter column city set not null;

-- New events only need a city and a country from now on
alter table public.events alter column location drop not null;
