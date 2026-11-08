-- Business-rule tests for the Yalla Ok schema. Run with scripts/test-db.sh.
\set ON_ERROR_STOP on
\set QUIET on

create schema t;
grant usage on schema t to anon, authenticated, service_role;

create function t.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;

create function t.fails(stmt text, pattern text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm ~* pattern then
      raise notice 'ok - %', label;
      return;
    end if;
    raise exception 'FAIL: % (wrong error: %)', label, sqlerrm;
  end;
  raise exception 'FAIL: % (statement succeeded)', label;
end $$;
grant execute on all functions in schema t to anon, authenticated, service_role;

create function t.act_as(p_user uuid, p_role text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
  execute format('set role %I', p_role);
end $$;

-- Users
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@example.com', '{"display_name":"Admin"}'),
  ('00000000-0000-0000-0000-000000000001', 'rana@example.com',  '{"full_name":"Rana K."}'),
  ('00000000-0000-0000-0000-000000000002', 'omar@example.com',  '{}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';

select t.ok((select count(*) = 3 from public.profiles), 'profiles are created for new auth users');
select t.ok((select display_name = 'omar' from public.profiles where email = 'omar@example.com'), 'display name falls back to the email name');

-- ---------------------------------------------------------------- posting
select t.act_as('00000000-0000-0000-0000-000000000001', 'authenticated');

select t.ok((select free_left = 3 from public.my_posting_quota()), 'new users have 3 free postings');

create temp table r1 as select * from public.create_task('Assemble IKEA desk', 'One desk, all parts ready.', 5000, 'Achrafieh', '+961 70 123 456', 180, null, 'aaaaaaaa-0000-0000-0000-000000000001');
select t.ok((select task_status = 'active' and not needs_payment from r1), 'first free task goes live immediately');
select t.ok((select expires_at - published_at = interval '180 minutes' from public.tasks where id = (select task_id from r1)), 'countdown runs from publication for the chosen duration');
select t.ok((select whatsapp = '+96170123456' from public.task_contacts where task_id = (select task_id from r1)), 'WhatsApp number is normalised');

-- Idempotency: same client token returns the same task and does not use another free slot.
create temp table r1b as select * from public.create_task('Assemble IKEA desk', 'One desk, all parts ready.', 5000, 'Achrafieh', '+961 70 123 456', 180, null, 'aaaaaaaa-0000-0000-0000-000000000001');
select t.ok((select task_id from r1b) = (select task_id from r1), 'resubmitting the same form returns the same task');
select t.ok((select free_used = 1 from public.my_posting_quota()), 'a double submit uses one free slot only');

select t.fails($$select public.create_task('Assemble IKEA desk', 'One desk, all parts ready.', 5000, 'achrafieh ', '+96170123456', 60, null, null)$$,
  'duplicate_task', 'the same listing twice is refused');
select t.fails($$select public.create_task('Valid headline', 'desc', 5000, 'Hamra', '12345', 60, null, null)$$, 'invalid_whatsapp', 'WhatsApp needs a country code');
select t.fails($$select public.create_task('Valid headline', 'desc', 5000, 'Hamra', '+96170123456', 45, null, null)$$, 'invalid_duration', 'only allowed durations');
select t.fails($$select public.create_task('Valid headline', 'desc', 0, 'Hamra', '+96170123456', 60, null, null)$$, 'invalid_reward', 'reward must be positive');
select t.fails($$select public.create_task(repeat('x', 51), 'desc', 100, 'Hamra', '+96170123456', 60, null, null)$$, 'invalid_headline', 'headline max 50');
select t.fails($$select public.create_task('Valid headline', repeat('x', 121), 100, 'Hamra', '+96170123456', 60, null, null)$$, 'invalid_description', 'description max 120');
select t.fails($$select public.create_task('Valid headline', 'desc', 100, 'Hamra', '+96170123456', 60, '00000000-0000-0000-0000-000000000002/x.webp', null)$$, 'invalid_image', 'cannot attach someone else''s image');

select * from public.create_task('Pick up a package', 'From DHL in Hamra and deliver to me.', 3000, 'Hamra', '+96170123456', 60, '00000000-0000-0000-0000-000000000001/p.webp', null) \gset p2_
select t.ok(:'p2_task_status' = 'active', 'second free task live');

-- Spam detection holds the listing for review (still a free slot).
select * from public.create_task('Earn with crypto fast', 'Message me, visit www.example.com', 100, 'Hamra', '+96170123456', 60, null, null) \gset p3_
select t.ok(:'p3_task_status' = 'pending_approval', 'suspicious text is held for review');
select t.ok((select flagged_reason is not null from public.tasks where id = :'p3_task_id'), 'flag reason recorded');

-- Fourth task: no free slots left → draft that needs payment.
select * from public.create_task('Take my dog for a walk', '30–45 min.', 2000, 'Ras Beirut', '+96170123456', 60, null, null) \gset p4_
select t.ok(:'p4_task_status' = 'draft' and :'p4_needs_payment'::boolean, 'fourth task needs the listing fee');
select t.ok((select fee_cents = 100 and not is_free from public.tasks where id = :'p4_task_id'), 'listing fee captured on the task');
select t.ok((select free_left = 0 from public.my_posting_quota()), 'no free postings left');

-- Users cannot write to tables directly.
select t.fails($$update public.tasks set status = 'active' where id = '$$ || :'p4_task_id' || $$'$$, 'permission denied', 'no direct status changes');
select t.fails($$insert into public.verified_payments (submission_id, amount_cents, currency, reference_normalized, verified_by) values (gen_random_uuid(), 1, 'USD', 'X', auth.uid())$$, 'permission denied', 'no self-verified payments');
select t.fails($$update public.profiles set free_posts_used = 0 where id = auth.uid()$$, 'permission denied', 'cannot reset free usage');
select t.fails($$update public.profiles set role = 'admin' where id = auth.uid()$$, 'permission denied', 'cannot make yourself admin');
update public.profiles set display_name = 'Rana' where id = auth.uid();
select t.ok((select poster_name = 'Rana' from public.tasks where id = (select task_id from r1)), 'name change updates poster name on tasks');
select t.fails($$select public.admin_approve_payment(gen_random_uuid(), null)$$, 'forbidden', 'admin functions are admin only');
select t.fails($$select public.expire_tasks()$$, 'permission denied', 'expire_tasks is server only');
select t.fails($$select public.report_task(gen_random_uuid(), null, 'xxxxxxxxxx', 'spam', null)$$, 'permission denied', 'report_task is server only');

-- --------------------------------------------------------------- payment
select t.fails($$select public.submit_payment('$$ || :'p4_task_id' || $$', 'x', null)$$, 'invalid_reference', 'reference required');
select public.submit_payment(:'p4_task_id', 'WH-123 456', '00000000-0000-0000-0000-000000000001/proof.webp') as sub1 \gset
select t.ok((select status = 'pending_payment' from public.tasks where id = :'p4_task_id'), 'submitted payment → pending payment');
select t.fails($$select public.submit_payment('$$ || :'p4_task_id' || $$', 'WH-999', null)$$, 'payment_already_submitted', 'one pending submission at a time');

-- Another user can't pay for / see someone else's task contact.
select t.act_as('00000000-0000-0000-0000-000000000002', 'authenticated');
select t.fails($$select public.submit_payment('$$ || :'p4_task_id' || $$', 'WH-777', null)$$, 'task_not_found', 'cannot pay for another user''s task');
select t.fails($$select public.mark_task_taken('$$ || (select task_id from r1) || $$')$$, 'task_not_found', 'cannot mark another user''s task taken');
select t.ok((select count(*) = 0 from public.task_contacts), 'other users cannot read WhatsApp numbers');
select t.ok((select count(*) = 0 from public.payment_submissions), 'other users cannot read payment submissions');
select t.ok((select count(*) = 0 from public.profiles where id <> auth.uid()), 'other users cannot read profiles');

-- Anonymous visitors see only live tasks.
select t.act_as(null, 'anon');
select t.ok((select count(*) = 2 from public.tasks), 'visitors see only active tasks');
select t.fails($$select * from public.task_contacts$$, 'permission denied', 'visitors cannot read contacts');
select t.fails($$select * from public.profiles$$, 'permission denied', 'visitors cannot read profiles');

-- Admin reviews the payment.
select t.act_as('00000000-0000-0000-0000-00000000000a', 'authenticated');
select public.admin_approve_payment(:'sub1', 'Seen in Whish app');
select t.ok((select status = 'active' and published_at is not null from public.tasks where id = :'p4_task_id'), 'approved payment publishes the task');
select t.ok((select count(*) = 1 from public.verified_payments), 'verified payment recorded');
select t.ok((select count(*) = 1 from public.admin_audit_logs where action = 'payment.approve'), 'approval is audited');
select t.fails($$select public.admin_approve_payment('$$ || :'sub1' || $$', null)$$, 'submission_already_reviewed', 'cannot approve twice');

-- A Whish reference can pay for one listing only.
select t.act_as('00000000-0000-0000-0000-000000000001', 'authenticated');
select * from public.create_task('Move a small sofa', 'From Achrafieh to Sin El Fil.', 8000, 'Achrafieh', '+96170123456', 360, null, null) \gset p5_
select t.fails($$select public.submit_payment('$$ || :'p5_task_id' || $$', 'wh 123-456', null)$$, 'reference_already_used', 'reused Whish reference refused');
select public.submit_payment(:'p5_task_id', 'WH-555', null) as sub2 \gset

select t.act_as('00000000-0000-0000-0000-00000000000a', 'authenticated');
select t.fails($$select public.admin_reject_payment('$$ || :'sub2' || $$', '')$$, 'reason_required', 'rejecting needs a reason');
select public.admin_reject_payment(:'sub2', 'Not received in Whish');
select t.ok((select status = 'draft' and rejection_reason like 'Payment not confirmed%' from public.tasks where id = :'p5_task_id'), 'rejected payment → draft again with reason');

-- Admin can't approve their own payment.
select * from public.create_task('Admin task one', 'test', 100, 'Hamra', '+96170123456', 60, null, null) \gset a1_
reset role;
update public.profiles set free_posts_bonus = -3 where id = '00000000-0000-0000-0000-00000000000a';
select t.act_as('00000000-0000-0000-0000-00000000000a', 'authenticated');
select * from public.create_task('Admin task two', 'test', 100, 'Hamra', '+96170123456', 60, null, null) \gset a2_
select public.submit_payment(:'a2_task_id', 'ADMIN-1', null) as sub3 \gset
select t.fails($$select public.admin_approve_payment('$$ || :'sub3' || $$', null)$$, 'cannot_review_own_payment', 'admins cannot approve their own payment');

-- Moderation queue.
select t.fails($$select public.admin_approve_task('$$ || :'p4_task_id' || $$')$$, 'task_not_pending_approval', 'only pending tasks can be approved');
select public.admin_approve_task(:'p3_task_id');
select t.ok((select status = 'active' from public.tasks where id = :'p3_task_id'), 'admin approves held task');

-- Free posting allowance adjustment.
select public.admin_set_free_bonus('00000000-0000-0000-0000-000000000001', 2);
select t.act_as('00000000-0000-0000-0000-000000000001', 'authenticated');
select t.ok((select free_left = 2 from public.my_posting_quota()), 'admin can grant extra free postings');

-- Taken
select public.mark_task_taken((select task_id from r1));
select t.ok((select status = 'taken' and taken_at is not null from public.tasks where id = (select task_id from r1)), 'poster marks task taken');
select t.fails($$select public.mark_task_taken('$$ || (select task_id from r1) || $$')$$, 'task_not_active', 'only live tasks can be marked taken');

-- Expiry
reset role;
update public.tasks set expires_at = now() - interval '1 second' where id = :'p2_task_id';
select t.act_as(null, 'anon');
select t.ok((select count(*) = 0 from public.tasks where id = :'p2_task_id'), 'past-deadline task hidden even before the expiry job runs');
select t.act_as(null, 'service_role');
select t.ok((select public.expire_tasks() = 1), 'expiry job expires overdue tasks');
reset role;
select t.ok((select status = 'expired' from public.tasks where id = :'p2_task_id'), 'task status is expired');

-- Feed events
select t.ok((select count(*) filter (where kind = 'published') >= 4 and count(*) filter (where kind = 'removed') >= 2 from public.feed_events), 'feed events emitted for publish and removal');

-- Reports: three distinct reporters pull a task for review.
select t.act_as(null, 'service_role');
select public.report_task(:'p4_task_id', null, 'ip-hash-0001', 'scam', 'asks for money upfront');
select public.report_task(:'p4_task_id', null, 'ip-hash-0001', 'scam', 'again');      -- same reporter: ignored
select public.report_task(:'p4_task_id', null, 'ip-hash-0002', 'spam', null);
reset role;
select t.ok((select status = 'active' from public.tasks where id = :'p4_task_id'), 'two reporters are not enough');
select t.act_as(null, 'service_role');
select public.report_task(:'p4_task_id', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'inappropriate', null);
reset role;
select t.ok((select status = 'pending_approval' from public.tasks where id = :'p4_task_id'), 'three reporters hold the task for review');

-- Ban
select t.act_as('00000000-0000-0000-0000-00000000000a', 'authenticated');
select t.fails($$select public.admin_set_user_status('00000000-0000-0000-0000-00000000000a', 'banned')$$, 'cannot_change_own_account', 'admins cannot ban themselves');
select public.admin_set_user_status('00000000-0000-0000-0000-000000000001', 'banned');
select t.ok((select count(*) = 0 from public.tasks where user_id = '00000000-0000-0000-0000-000000000001' and status in ('active', 'pending_approval', 'draft', 'pending_payment')), 'banning takes the user''s listings down');
select t.act_as('00000000-0000-0000-0000-000000000001', 'authenticated');
select t.fails($$select public.create_task('Another task', 'x', 100, 'Hamra', '+96170123456', 60, null, null)$$, 'account_suspended', 'banned users cannot post');

-- Settings
select t.act_as('00000000-0000-0000-0000-00000000000a', 'authenticated');
select public.admin_update_settings('{"posting_fee_cents": 200, "allowed_durations": [60, 30, 60], "blocked_words": [" Scam "], "whish_number": "+961 71 111 111"}');
select t.ok((select posting_fee_cents = 200 and allowed_durations = '{30,60}' and blocked_words = '{scam}' and free_posts = 3 from public.platform_settings), 'settings update only the given fields');
select public.admin_update_settings('{"hero_title": "Hi"}');
select t.ok((select blocked_words = '{scam}' from public.platform_settings), 'omitted blocked words are kept');
select t.ok((select (public.admin_stats() ->> 'paid_postings')::int = 1), 'stats count paid postings');

-- Free slots can't be recovered by deleting.
reset role;
delete from public.tasks where user_id = '00000000-0000-0000-0000-000000000001' and id <> :'p4_task_id';
select t.ok((select count(*) = 3 from public.free_post_usage where user_id = '00000000-0000-0000-0000-000000000001'), 'free slot usage outlives the tasks');

\echo 'All business-rule tests passed.'
