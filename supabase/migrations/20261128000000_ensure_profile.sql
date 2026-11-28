-- Recreates the signed-in user's profile when it is missing, for example after the profile row
-- was deleted by hand but the account (auth.users) was kept. Sign-up creates profiles through the
-- on_auth_user_created trigger; this covers the gap. It only ever creates the caller's own row,
-- with the defaults, so level and blocked stay out of the user's reach.
create function public.ensure_profile() returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  insert into public.profiles (id) values ((select auth.uid())) on conflict (id) do nothing;
end
$$;

comment on function public.ensure_profile() is 'Creates the caller''s profile if it is missing; called by the site when no profile is found';

revoke execute on function public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated;
