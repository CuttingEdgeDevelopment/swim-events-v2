-- Step 2 of trimming `location` to the city: run once the site reads `city` and
-- `country`. Drops `location` and the backup taken before the country column.

create or replace function public.normalize_event_country() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  place text := trim(new.city);
  code text;
begin
  -- a city typed as "Basel (SUI)" is split into the city and, when it's empty, the country
  code := substring(place from '\(([A-Za-z]{3})\)\s*$');
  new.city := coalesce(substring(place from '^(.+?)\s*\([A-Za-z]{3}\)\s*$'), place);
  new.country := upper(trim(coalesce(new.country, code)));
  new.country := coalesce(
    (select a.ioc from public.country_aliases a where a.alias = new.country),
    new.country
  );
  return new;
end
$$;

alter table public.events drop column location;

drop table public.events_backup_20261021;
