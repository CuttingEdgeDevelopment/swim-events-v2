-- The trigger function and the alias table are internal: nobody calls the function over
-- the API (triggers fire without EXECUTE), and only the trigger reads the aliases.
revoke execute on function public.normalize_event_country() from public, anon, authenticated;
revoke all on public.country_aliases from anon, authenticated;
