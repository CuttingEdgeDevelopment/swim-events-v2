-- A missing profile is recreated for its own account only. Run with `supabase test db`.
begin;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'cleo@example.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'dan@example.com');

-- Cleo's profile is deleted by hand, her account stays
delete from public.profiles where id = '00000000-0000-0000-0000-0000000000c1';

set local role anon;
select throws_ok($$ select public.ensure_profile() $$, '42501', null, 'anon cannot call ensure_profile');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select lives_ok($$ select public.ensure_profile() $$, 'a signed-in user can call ensure_profile');
select is((select count(*) from public.profiles)::int, 1, 'the missing profile is back, and the user still only sees their own');
select lives_ok($$ select public.ensure_profile() $$, 'calling it again with a profile in place changes nothing');
reset role;

select is((select level from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'), 'standard', 'the recreated profile has the defaults');
select is((select count(*) from public.profiles where id in ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2'))::int, 2, 'other profiles are untouched');

select * from finish();
rollback;
