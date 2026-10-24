-- Who can see and change what, and the rules on submissions. Run with `supabase test db`.
begin;
select plan(49);

-- Two organisers and a listed event
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'anna@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'ben@example.com');

insert into public.events (id, name, city, country, "dateStart", "dateEnd")
overriding system value
values
  (900, 'Basler Wintermeeting', 'Basel', 'SUI', current_date + 20, current_date + 21),
  (901, 'Old Meet', 'Bern', 'SUI', current_date - 30, current_date - 29);

-- Profiles are created on sign-up
select is((select count(*) from public.profiles)::int, 2, 'a profile is created for each new account');
select is((select level from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'standard', 'new accounts are standard');

-- Visitors who aren't signed in
set local role anon;
select is((select count(*) from public.events where id = 900)::int, 1, 'anon can read events');
select throws_ok($$ select * from public.event_submissions $$, '42501', null, 'anon cannot read submissions');
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');
select throws_ok($$ select * from public.event_owners $$, '42501', null, 'anon cannot read owners');
select throws_ok($$ select * from public.settings $$, '42501', null, 'anon cannot read settings');
select throws_ok($$ insert into public.events (name, city, country, "dateStart", "dateEnd") values ('X', 'Y', 'SUI', current_date, current_date) $$,
  '42501', null, 'anon cannot add events');
select throws_ok($$ select public.delete_my_account() $$, '42501', null, 'anon cannot call delete_my_account');
reset role;

-- Anna, signed in
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

select is((select count(*) from public.events where id = 900)::int, 1, 'signed-in users can read events');
select is((select count(*) from public.profiles)::int, 1, 'users only see their own profile');
select throws_ok($$ select * from public.submission_limits $$, '42501', null, 'users cannot read the limits');
select throws_ok($$ update public.profiles set level = 'trusted' $$, '42501', null, 'users cannot change their level');
select throws_ok($$ update public.profiles set blocked = false $$, '42501', null, 'users cannot unblock themselves');
select lives_ok($$ update public.profiles set display_name = 'Anna', terms_accepted_at = now() $$, 'users can edit their profile');

select lives_ok($$
  insert into public.event_submissions (name, city, country, "dateStart", "dateEnd", link, note, organiser_role, organiser_confirmed, idempotency_key)
  values ('  Basel Winter Meet ', 'Basel', 'sui', current_date + 20, current_date + 21, 'https://example.com', E'Short course\n25 m', 'Meet director', true, gen_random_uuid())
$$, 'an organiser can submit an event');
select is((select name from public.event_submissions), 'Basel Winter Meet', 'text is trimmed');
select is((select country from public.event_submissions), 'SUI', 'the country is normalised');
select is((select user_id from public.event_submissions), '00000000-0000-0000-0000-00000000000a'::uuid, 'the submission belongs to the submitter');

select throws_ok($$
  insert into public.event_submissions (name, city, country, "dateStart", "dateEnd", organiser_role, organiser_confirmed, idempotency_key, status)
  values ('Sneaky Meet', 'Basel', 'SUI', current_date + 20, current_date + 20, 'Director', true, gen_random_uuid(), 'approved')
$$, '42501', null, 'users cannot set the status');
select throws_ok($$
  insert into public.event_submissions (name, city, country, "dateStart", "dateEnd", organiser_role, organiser_confirmed, idempotency_key)
  values ('Soon Meet', 'Basel', 'SUI', current_date + 1, current_date + 1, 'Director', true, gen_random_uuid())
$$, 'P0001', 'date_too_soon', 'events must start at least 2 days from today');
select throws_ok($$
  insert into public.event_submissions (name, city, country, "dateStart", "dateEnd", organiser_role, organiser_confirmed, idempotency_key)
  values ('Not Mine', 'Basel', 'SUI', current_date + 20, current_date + 20, 'Fan', false, gen_random_uuid())
$$, '23514', null, 'the organiser box must be ticked');
select throws_ok($$
  insert into public.event_submissions (name, city, country, "dateStart", "dateEnd", link, organiser_role, organiser_confirmed, idempotency_key)
  values ('Bad Link', 'Basel', 'SUI', current_date + 20, current_date + 20, 'javascript:alert(1)', 'Director', true, gen_random_uuid())
$$, '23514', null, 'only http(s) links are accepted');

-- Claims
select throws_ok($$
  insert into public.event_submissions (kind, event_id, name, city, country, "dateStart", "dateEnd", organiser_role, organiser_confirmed, idempotency_key)
  values ('claim', 901, 'x', 'x', 'SUI', current_date, current_date, 'Director', true, gen_random_uuid())
$$, 'P0001', 'event_not_claimable', 'past events cannot be claimed');
select lives_ok($$
  insert into public.event_submissions (kind, event_id, name, city, country, "dateStart", "dateEnd", organiser_role, organiser_confirmed, idempotency_key)
  values ('claim', 900, 'anything', 'x', 'SUI', current_date, current_date, 'Meet director', true, gen_random_uuid())
$$, 'an organiser can claim a listed event');
select is((select name from public.event_submissions where kind = 'claim'), 'Basler Wintermeeting', 'a claim copies the listed event');
select throws_ok($$
  insert into public.event_submissions (kind, event_id, name, city, country, "dateStart", "dateEnd", organiser_role, organiser_confirmed, idempotency_key)
  values ('claim', 900, 'x', 'x', 'SUI', current_date, current_date, 'Meet director', true, gen_random_uuid())
$$, 'P0001', 'claim_waiting', 'the same event cannot be claimed twice while waiting');

-- Waiting limit: 2 waiting now, the third is fine, the fourth is not
select lives_ok($$
  insert into public.event_submissions (name, city, country, "dateStart", "dateEnd", organiser_role, organiser_confirmed, idempotency_key)
  values ('Third Meet', 'Bern', 'SUI', current_date + 30, current_date + 30, 'Director', true, gen_random_uuid())
$$, 'a third submission may wait');
select throws_ok($$
  insert into public.event_submissions (name, city, country, "dateStart", "dateEnd", organiser_role, organiser_confirmed, idempotency_key)
  values ('Over Limit Meet', 'Bern', 'SUI', current_date + 30, current_date + 30, 'Director', true, gen_random_uuid())
$$, 'P0001', 'too_many_waiting', 'standard accounts have at most 3 waiting');

-- Withdrawing, but never deciding
select lives_ok($$ update public.event_submissions set status = 'withdrawn' where name = 'Third Meet' $$, 'users can withdraw a waiting submission');
select is((select status from public.event_submissions where name = 'Third Meet'), 'withdrawn', 'the submission is withdrawn');
select throws_ok($$ update public.event_submissions set status = 'approved' where name = 'Basel Winter Meet' $$,
  '42501', null, 'users cannot approve their own submission');

-- Daily limit: 3 sent so far (withdrawn ones count), the 4th and 5th are fine, the 6th is not
select lives_ok($$
  insert into public.event_submissions (name, city, country, "dateStart", "dateEnd", organiser_role, organiser_confirmed, idempotency_key)
  values ('Fourth Meet', 'Bern', 'SUI', current_date + 40, current_date + 40, 'Director', true, gen_random_uuid())
$$, 'a fourth submission in a day is fine');
update public.event_submissions set status = 'withdrawn' where name = 'Fourth Meet';
select lives_ok($$
  insert into public.event_submissions (name, city, country, "dateStart", "dateEnd", organiser_role, organiser_confirmed, idempotency_key)
  values ('Fifth Meet', 'Bern', 'SUI', current_date + 40, current_date + 40, 'Director', true, gen_random_uuid())
$$, 'a fifth submission in a day is fine');
update public.event_submissions set status = 'withdrawn' where name = 'Fifth Meet';
select throws_ok($$
  insert into public.event_submissions (name, city, country, "dateStart", "dateEnd", organiser_role, organiser_confirmed, idempotency_key)
  values ('Sixth Meet', 'Bern', 'SUI', current_date + 40, current_date + 40, 'Director', true, gen_random_uuid())
$$, 'P0001', 'daily_limit', 'standard accounts send at most 5 a day');
reset role;

-- Ben, signed in, sees none of Anna's data
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
select is((select count(*) from public.event_submissions)::int, 0, 'users cannot see other people''s submissions');
update public.event_submissions set status = 'withdrawn';
reset role;
select is((select count(*) from public.event_submissions where status = 'withdrawn')::int, 3, 'users cannot withdraw other people''s submissions');

-- Nico decides in the table editor
update public.event_submissions set status = 'approved' where name = 'Basel Winter Meet';
select isnt((select event_id from public.event_submissions where name = 'Basel Winter Meet'), null, 'approving a new event stores its id');
select is((select count(*) from public.events where name = 'Basel Winter Meet')::int, 1, 'approving a new event publishes it');
select is((select count(*) from public.event_owners where user_id = '00000000-0000-0000-0000-00000000000a')::int, 1, 'the submitter owns the published event');
update public.event_submissions set status = 'approved' where kind = 'claim';
select is((select count(*) from public.event_owners where event_id = 900)::int, 1, 'approving a claim links the event');
select throws_ok($$ update public.event_submissions set status = 'rejected' where kind = 'claim' $$, 'P0001', 'already_decided', 'decided submissions stay decided');

-- Spam blocks the account
insert into public.event_submissions (user_id, name, city, country, "dateStart", "dateEnd", organiser_role, organiser_confirmed, idempotency_key)
values ('00000000-0000-0000-0000-00000000000b', 'Buy Pills', 'Basel', 'SUI', current_date + 20, current_date + 20, 'Seller', true, gen_random_uuid());
update public.event_submissions set status = 'spam' where name = 'Buy Pills';
select is((select blocked from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), true, 'marking spam blocks the account');
select throws_ok($$
  insert into public.event_submissions (user_id, name, city, country, "dateStart", "dateEnd", organiser_role, organiser_confirmed, idempotency_key)
  values ('00000000-0000-0000-0000-00000000000b', 'Again', 'Basel', 'SUI', current_date + 20, current_date + 20, 'Seller', true, gen_random_uuid())
$$, 'P0001', 'account_blocked', 'blocked accounts cannot submit');

-- Pausing all submissions
update public.settings set submissions_open = false;
select throws_ok($$
  insert into public.event_submissions (user_id, name, city, country, "dateStart", "dateEnd", organiser_role, organiser_confirmed, idempotency_key)
  values ('00000000-0000-0000-0000-00000000000a', 'Paused', 'Basel', 'SUI', current_date + 20, current_date + 20, 'Director', true, gen_random_uuid())
$$, 'P0001', 'submissions_closed', 'no submissions while paused');
update public.settings set submissions_open = true;

-- Deleting an account
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select lives_ok($$ select public.delete_my_account() $$, 'users can delete their account');
reset role;
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000a')::int, 0, 'the profile goes with the account');
select is((select count(*) from public.event_submissions where user_id is null)::int, 5, 'submissions stay without the link to the account');
select is((select count(*) from public.events where name = 'Basel Winter Meet')::int, 1, 'published events stay');

select * from finish();
rollback;
