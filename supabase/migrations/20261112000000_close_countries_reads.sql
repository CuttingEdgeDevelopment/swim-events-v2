-- Close public reads on `countries`.
--
-- The site never reads this table: the browser has its own copy in `src/lib/countries.ts`.
-- The table stays, because it still checks every country code (the foreign keys from
-- `events`, `event_submissions` and `country_aliases`) and gives the country dropdown in the
-- Supabase table editor. Foreign key checks run as the table owner, so they keep working
-- without any grant to `anon` or `authenticated`.
--
-- Rollback:
--   create policy "Countries are readable by everyone" on public.countries for select using (true);
--   grant select on public.countries to anon, authenticated;

drop policy if exists "Countries are readable by everyone" on public.countries;
revoke all on public.countries from anon, authenticated;
