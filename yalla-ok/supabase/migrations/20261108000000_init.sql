-- =====================================================================
-- Yalla Ok — initial schema
--
-- Security model
--   * The browser only ever READS through Row Level Security.
--   * Every write that matters (posting, payments, status changes, admin
--     actions) goes through SECURITY DEFINER functions below, which check
--     the caller (auth.uid()) and run in a single transaction.
--   * Direct INSERT / UPDATE / DELETE on tables is revoked from anon and
--     authenticated (except a profile's own display name and photo).
--   * WhatsApp numbers live in task_contacts, which the public can't read.
--     They are revealed only by the /t/[id]/contact redirect (server side).
--
-- Money
--   * tasks.reward_cents is what the POSTER pays the worker, directly.
--     Yalla Ok never touches it.
--   * tasks.fee_cents / payment_submissions / verified_payments are the
--     Yalla Ok listing fee, paid to the admin through Whish.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
create type public.task_status as enum (
  'draft', 'pending_payment', 'pending_approval', 'active', 'taken', 'expired', 'rejected'
);
create type public.user_role as enum ('user', 'admin');
create type public.account_status as enum ('active', 'suspended', 'banned');
create type public.submission_status as enum ('pending', 'approved', 'rejected');
create type public.report_status as enum ('open', 'resolved', 'dismissed');

-- ---------------------------------------------------------------------
-- Platform settings (single row)
-- ---------------------------------------------------------------------
create table public.platform_settings (
  id                   smallint primary key default 1 check (id = 1),
  brand_name           text    not null default 'Yalla Ok' check (char_length(brand_name) between 1 and 40),
  hero_title           text    not null default 'Post it. Get it done.' check (char_length(hero_title) between 1 and 80),
  hero_subtitle        text    not null default 'Live tasks people will pay to have done. Tap one and chat on WhatsApp.'
                                check (char_length(hero_subtitle) <= 200),
  posting_fee_cents    integer not null default 100 check (posting_fee_cents between 0 and 100000),
  currency             text    not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  free_posts           integer not null default 3 check (free_posts between 0 and 1000),
  whish_account_name   text    not null default 'Yalla Ok' check (char_length(whish_account_name) <= 80),
  whish_number         text    not null default '+961 00 000 000' check (char_length(whish_number) <= 40),
  payment_instructions text    not null default
    'Open Whish Money, choose "Send money", enter the number above and send the exact amount. Then paste the transaction reference below.'
    check (char_length(payment_instructions) <= 1000),
  allowed_durations    integer[] not null default '{30,60,180,360,720,1440}'
    check (cardinality(allowed_durations) between 1 and 12 and 5 <= all(allowed_durations) and 10080 >= all(allowed_durations)),
  auto_publish         boolean not null default true,   -- free / clean tasks go live without manual review
  max_tasks_per_hour   integer not null default 5  check (max_tasks_per_hour between 1 and 1000),
  max_tasks_per_day    integer not null default 15 check (max_tasks_per_day between 1 and 10000),
  blocked_words        text[]  not null default '{}',
  updated_at           timestamptz not null default now()
);
insert into public.platform_settings (id) values (1);

-- ---------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  email            text,                       -- private: only the user and admins can read it
  display_name     text not null check (char_length(btrim(display_name)) between 1 and 40),
  avatar_url       text check (avatar_url is null or char_length(avatar_url) <= 500),
  role             public.user_role      not null default 'user',
  status           public.account_status not null default 'active',
  free_posts_used  integer not null default 0 check (free_posts_used >= 0),
  free_posts_bonus integer not null default 0 check (free_posts_bonus between -1000 and 1000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index profiles_created_idx on public.profiles (created_at desc);

-- ---------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------
create table public.tasks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.profiles (id) on delete set null,
  poster_name      text not null,
  headline         text not null check (char_length(headline) between 3 and 50),
  description      text not null check (char_length(description) between 1 and 120),
  reward_cents     integer not null check (reward_cents between 1 and 10000000),
  location         text not null check (char_length(location) between 2 and 60),
  duration_minutes integer not null check (duration_minutes between 5 and 10080),
  image_path       text check (image_path is null or char_length(image_path) <= 300),
  status           public.task_status not null default 'draft',
  is_free          boolean not null default false,
  fee_cents        integer not null default 0 check (fee_cents >= 0),
  is_demo          boolean not null default false,
  client_token     uuid,
  content_hash     text not null,
  flagged_reason   text,
  rejection_reason text,
  published_at     timestamptz,
  expires_at       timestamptz,
  taken_at         timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint tasks_client_token_unique unique (user_id, client_token),
  constraint tasks_owner_required check (is_demo or user_id is not null),
  constraint tasks_active_has_times check (status <> 'active' or (published_at is not null and expires_at is not null))
);
create index tasks_feed_idx      on public.tasks (published_at desc) where status = 'active';
create index tasks_expiry_idx    on public.tasks (expires_at)        where status = 'active';
create index tasks_user_idx      on public.tasks (user_id, created_at desc);
create index tasks_status_idx    on public.tasks (status, created_at desc);
create index tasks_hash_idx      on public.tasks (content_hash);

-- Private contact details for a task (never readable by the public)
create table public.task_contacts (
  task_id  uuid primary key references public.tasks (id) on delete cascade,
  whatsapp text not null check (whatsapp ~ '^\+[1-9][0-9]{6,14}$')
);

-- One row per free posting ever used. (user_id, slot) is unique, so a free
-- slot can never be handed out twice, and deleting a task doesn't give it back.
create table public.free_post_usage (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  slot       integer not null check (slot >= 1),
  task_id    uuid references public.tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint free_post_usage_slot_unique unique (user_id, slot)
);

-- ---------------------------------------------------------------------
-- Payments (Whish listing fee)
-- ---------------------------------------------------------------------
create table public.payment_submissions (
  id                   uuid primary key default gen_random_uuid(),
  task_id              uuid not null references public.tasks (id) on delete cascade,
  user_id              uuid references public.profiles (id) on delete set null,
  amount_cents         integer not null check (amount_cents >= 0),
  currency             text not null,
  reference            text not null check (char_length(btrim(reference)) between 3 and 80),
  reference_normalized text generated always as (upper(regexp_replace(reference, '[^A-Za-z0-9]', '', 'g'))) stored,
  screenshot_path      text,
  status               public.submission_status not null default 'pending',
  review_note          text check (review_note is null or char_length(review_note) <= 500),
  reviewed_by          uuid references public.profiles (id) on delete set null,
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now()
);
-- At most one submission waiting for review per task.
create unique index payment_submissions_one_pending on public.payment_submissions (task_id) where status = 'pending';
create index payment_submissions_status_idx on public.payment_submissions (status, created_at desc);
create index payment_submissions_ref_idx    on public.payment_submissions (reference_normalized);

-- Money the admin has confirmed arrived in the Whish account.
create table public.verified_payments (
  id                   uuid primary key default gen_random_uuid(),
  submission_id        uuid not null unique references public.payment_submissions (id) on delete restrict,
  task_id              uuid unique references public.tasks (id) on delete set null,
  user_id              uuid references public.profiles (id) on delete set null,
  amount_cents         integer not null check (amount_cents >= 0),
  currency             text not null,
  reference_normalized text not null unique,   -- a Whish transfer can pay for one listing only
  verified_by          uuid not null references public.profiles (id),
  verified_at          timestamptz not null default now()
);
create index verified_payments_time_idx on public.verified_payments (verified_at desc);

-- ---------------------------------------------------------------------
-- Reports, audit log, live feed events
-- ---------------------------------------------------------------------
create table public.task_reports (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks (id) on delete cascade,
  reporter_id  uuid references public.profiles (id) on delete set null,
  reporter_key text not null,                  -- user id, or a salted hash of the IP for visitors
  reason       text not null check (reason in ('spam', 'scam', 'inappropriate', 'illegal', 'duplicate', 'other')),
  details      text check (details is null or char_length(details) <= 300),
  status       public.report_status not null default 'open',
  resolved_by  uuid references public.profiles (id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint task_reports_once unique (task_id, reporter_key)
);
create index task_reports_status_idx on public.task_reports (status, created_at desc);
create index task_reports_key_idx    on public.task_reports (reporter_key, created_at desc);

create table public.admin_audit_logs (
  id          bigserial primary key,
  admin_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  target_type text not null,
  target_id   text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index admin_audit_logs_time_idx on public.admin_audit_logs (created_at desc);

-- Tiny public table the live feed listens to (Supabase Realtime).
-- Postgres-changes on `tasks` can't tell visitors that a task LEFT the feed
-- (RLS hides the new row), so we publish explicit events instead.
create table public.feed_events (
  id         bigserial primary key,
  task_id    uuid not null,
  kind       text not null check (kind in ('published', 'updated', 'removed')),
  created_at timestamptz not null default now()
);
create index feed_events_time_idx on public.feed_events (created_at);

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.require_admin() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

create or replace function public.audit(p_action text, p_target_type text, p_target_id text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.admin_audit_logs (admin_id, action, target_type, target_id, details)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb));
$$;

-- Normalised text used to detect duplicate listings.
create or replace function public.task_content_hash(p_headline text, p_description text, p_location text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(
    lower(btrim(regexp_replace(coalesce(p_headline, ''), '\s+', ' ', 'g'))) || '|' ||
    lower(btrim(regexp_replace(coalesce(p_description, ''), '\s+', ' ', 'g'))) || '|' ||
    lower(btrim(regexp_replace(coalesce(p_location, ''), '\s+', ' ', 'g'))),
    'UTF8')), 'hex');
$$;

-- Lightweight content moderation. Returns a reason when a listing should be
-- held for review, or null when it looks fine.
create or replace function public.moderation_flag(p_text text, p_blocked text[])
returns text language plpgsql immutable as $$
declare
  w text;
  t text := lower(coalesce(p_text, ''));
begin
  if t ~ '(https?://|www\.|bit\.ly|t\.me/|\.(com|net|org|xyz|io|me)\M)' then
    return 'Contains a link';
  end if;
  if t ~ '(.)\1{7,}' then
    return 'Repeated characters';
  end if;
  if t ~ '\m(crypto|bitcoin|usdt|forex|investment|casino|betting|loan)\M' then
    return 'Looks like a financial / gambling offer';
  end if;
  if t ~ '\m(weed|cocaine|escort|gun|weapon|passport|fake id)\M' then
    return 'Possibly prohibited content';
  end if;
  if p_blocked is not null then
    foreach w in array p_blocked loop
      if btrim(w) <> '' and position(lower(btrim(w)) in t) > 0 then
        return 'Contains a blocked word';
      end if;
    end loop;
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

-- Create a profile for every new auth user.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Yalla user'
  );
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    left(v_name, 40),
    nullif(coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'), '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- Keep the public poster name on tasks in sync with the profile.
create or replace function public.sync_poster_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.display_name is distinct from old.display_name then
    update public.tasks set poster_name = new.display_name where user_id = new.id;
  end if;
  return new;
end $$;

create trigger profiles_sync_poster_name
  after update of display_name on public.profiles
  for each row execute function public.sync_poster_name();

-- Emit live-feed events whenever a task enters, changes in, or leaves the feed.
create or replace function public.emit_feed_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'active' then
      insert into public.feed_events (task_id, kind) values (new.id, 'published');
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status = 'active' and old.status <> 'active' then
      insert into public.feed_events (task_id, kind) values (new.id, 'published');
    elsif old.status = 'active' and new.status <> 'active' then
      insert into public.feed_events (task_id, kind) values (new.id, 'removed');
    elsif new.status = 'active' and (
      new.headline, new.description, new.reward_cents, new.location, new.image_path, new.expires_at, new.poster_name
    ) is distinct from (
      old.headline, old.description, old.reward_cents, old.location, old.image_path, old.expires_at, old.poster_name
    ) then
      insert into public.feed_events (task_id, kind) values (new.id, 'updated');
    end if;
  elsif tg_op = 'DELETE' then
    if old.status = 'active' then
      insert into public.feed_events (task_id, kind) values (old.id, 'removed');
    end if;
    return old;
  end if;
  return new;
end $$;

create trigger tasks_feed_events
  after insert or update or delete on public.tasks
  for each row execute function public.emit_feed_event();

-- ---------------------------------------------------------------------
-- User functions
-- ---------------------------------------------------------------------

-- Free postings left for the current user.
create or replace function public.my_posting_quota()
returns table (free_total integer, free_used integer, free_left integer, fee_cents integer, currency text)
language sql stable security definer set search_path = public as $$
  select
    greatest(s.free_posts + p.free_posts_bonus, 0),
    p.free_posts_used,
    greatest(s.free_posts + p.free_posts_bonus - p.free_posts_used, 0),
    s.posting_fee_cents,
    s.currency
  from public.profiles p cross join public.platform_settings s
  where p.id = auth.uid() and s.id = 1;
$$;

-- Create a task. Free postings are consumed atomically; paid ones are saved as
-- a draft until a Whish payment is submitted.
create or replace function public.create_task(
  p_headline         text,
  p_description      text,
  p_reward_cents     integer,
  p_location         text,
  p_whatsapp         text,
  p_duration_minutes integer,
  p_image_path       text,
  p_client_token     uuid
)
returns table (task_id uuid, task_status public.task_status, needs_payment boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid      uuid := auth.uid();
  v_profile  public.profiles;
  v_settings public.platform_settings;
  v_existing public.tasks;
  v_hash     text;
  v_flag     text;
  v_free     boolean;
  v_status   public.task_status;
  v_id       uuid;
  v_now      timestamptz := now();
  v_headline text := btrim(regexp_replace(coalesce(p_headline, ''), '\s+', ' ', 'g'));
  v_desc     text := btrim(regexp_replace(coalesce(p_description, ''), '\s+', ' ', 'g'));
  v_location text := btrim(regexp_replace(coalesce(p_location, ''), '\s+', ' ', 'g'));
  v_whatsapp text := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9+]', '', 'g');
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Serialise this user's postings so free slots and rate limits can't race.
  select * into v_profile from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'profile_missing';
  end if;
  if v_profile.status <> 'active' then
    raise exception 'account_suspended';
  end if;

  -- Idempotency: the same form submitted twice returns the same task.
  if p_client_token is not null then
    select * into v_existing from public.tasks t where t.user_id = v_uid and t.client_token = p_client_token;
    if found then
      return query select v_existing.id, v_existing.status, v_existing.status = 'draft';
      return;
    end if;
  end if;

  select * into v_settings from public.platform_settings where id = 1;

  -- Validation (the table CHECKs are the last line of defence).
  if char_length(v_headline) < 3 or char_length(v_headline) > 50 then raise exception 'invalid_headline'; end if;
  if char_length(v_desc) < 1 or char_length(v_desc) > 120 then raise exception 'invalid_description'; end if;
  if char_length(v_location) < 2 or char_length(v_location) > 60 then raise exception 'invalid_location'; end if;
  if p_reward_cents is null or p_reward_cents < 1 or p_reward_cents > 10000000 then raise exception 'invalid_reward'; end if;
  if v_whatsapp !~ '^\+[1-9][0-9]{6,14}$' then raise exception 'invalid_whatsapp'; end if;
  if p_duration_minutes is null or not (p_duration_minutes = any (v_settings.allowed_durations)) then
    raise exception 'invalid_duration';
  end if;
  if p_image_path is not null and (
       p_image_path not like v_uid::text || '/%' or p_image_path ~ '\.\.' or char_length(p_image_path) > 300) then
    raise exception 'invalid_image';
  end if;

  -- Rate limits.
  if (select count(*) from public.tasks t where t.user_id = v_uid and t.created_at > v_now - interval '1 hour')
       >= v_settings.max_tasks_per_hour then
    raise exception 'rate_limited';
  end if;
  if (select count(*) from public.tasks t where t.user_id = v_uid and t.created_at > v_now - interval '1 day')
       >= v_settings.max_tasks_per_day then
    raise exception 'rate_limited';
  end if;

  -- Duplicate detection.
  v_hash := public.task_content_hash(v_headline, v_desc, v_location);
  if exists (
    select 1 from public.tasks t
    where t.user_id = v_uid and t.content_hash = v_hash
      and t.status in ('draft', 'pending_payment', 'pending_approval', 'active')
  ) then
    raise exception 'duplicate_task';
  end if;

  v_flag := public.moderation_flag(v_headline || ' ' || v_desc || ' ' || v_location, v_settings.blocked_words);
  if v_flag is null and exists (
    select 1 from public.tasks t
    where t.content_hash = v_hash and t.user_id is distinct from v_uid
      and t.status = 'active' and t.created_at > v_now - interval '1 day'
  ) then
    v_flag := 'Same text as another live listing';
  end if;

  -- Free posting or paid?
  v_free := v_settings.posting_fee_cents = 0
         or v_profile.free_posts_used < v_settings.free_posts + v_profile.free_posts_bonus;

  if not v_free then
    v_status := 'draft';
  elsif v_flag is not null or not v_settings.auto_publish then
    v_status := 'pending_approval';
  else
    v_status := 'active';
  end if;

  insert into public.tasks (
    user_id, poster_name, headline, description, reward_cents, location, duration_minutes,
    image_path, status, is_free, fee_cents, client_token, content_hash, flagged_reason,
    published_at, expires_at
  ) values (
    v_uid, v_profile.display_name, v_headline, v_desc, p_reward_cents, v_location, p_duration_minutes,
    p_image_path, v_status, v_free, case when v_free then 0 else v_settings.posting_fee_cents end,
    p_client_token, v_hash, v_flag,
    case when v_status = 'active' then v_now end,
    case when v_status = 'active' then v_now + make_interval(mins => p_duration_minutes) end
  ) returning id into v_id;

  insert into public.task_contacts (task_id, whatsapp) values (v_id, v_whatsapp);

  if v_free and v_settings.posting_fee_cents > 0 then
    update public.profiles set free_posts_used = free_posts_used + 1 where id = v_uid;
    insert into public.free_post_usage (user_id, slot, task_id)
    values (v_uid, v_profile.free_posts_used + 1, v_id);
  end if;

  return query select v_id, v_status, v_status = 'draft';
end $$;

-- Submit a Whish payment reference for a draft task.
create or replace function public.submit_payment(p_task_id uuid, p_reference text, p_screenshot_path text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_task public.tasks;
  v_settings public.platform_settings;
  v_ref  text := btrim(coalesce(p_reference, ''));
  v_norm text;
  v_id   uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select * into v_task from public.tasks where id = p_task_id for update;
  if not found or v_task.user_id is distinct from v_uid then
    raise exception 'task_not_found';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and status <> 'active') then
    raise exception 'account_suspended';
  end if;
  if v_task.status = 'pending_payment' then
    raise exception 'payment_already_submitted';
  end if;
  if v_task.status <> 'draft' then
    raise exception 'task_not_awaiting_payment';
  end if;
  if char_length(v_ref) < 3 or char_length(v_ref) > 80 then
    raise exception 'invalid_reference';
  end if;
  if p_screenshot_path is not null and (
       p_screenshot_path not like v_uid::text || '/%' or p_screenshot_path ~ '\.\.') then
    raise exception 'invalid_image';
  end if;
  if (select count(*) from public.payment_submissions s where s.task_id = p_task_id) >= 5 then
    raise exception 'too_many_submissions';
  end if;

  v_norm := upper(regexp_replace(v_ref, '[^A-Za-z0-9]', '', 'g'));
  if char_length(v_norm) < 3 then raise exception 'invalid_reference'; end if;
  if exists (select 1 from public.verified_payments vp where vp.reference_normalized = v_norm) then
    raise exception 'reference_already_used';
  end if;

  select * into v_settings from public.platform_settings where id = 1;

  insert into public.payment_submissions (task_id, user_id, amount_cents, currency, reference, screenshot_path)
  values (p_task_id, v_uid, v_task.fee_cents, v_settings.currency, v_ref, p_screenshot_path)
  returning id into v_id;

  update public.tasks set status = 'pending_payment', rejection_reason = null where id = p_task_id;
  return v_id;
end $$;

-- The poster marks their live task as taken (it leaves the feed).
create or replace function public.mark_task_taken(p_task_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_task public.tasks;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found or v_task.user_id is distinct from auth.uid() then
    raise exception 'task_not_found';
  end if;
  if v_task.status <> 'active' then
    raise exception 'task_not_active';
  end if;
  update public.tasks set status = 'taken', taken_at = now() where id = p_task_id;
end $$;

-- The poster throws away an unpaid draft. (Drafts never use a free slot.)
create or replace function public.discard_draft(p_task_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_task public.tasks;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found or v_task.user_id is distinct from auth.uid() then
    raise exception 'task_not_found';
  end if;
  if v_task.status <> 'draft' or v_task.is_free then
    raise exception 'task_not_draft';
  end if;
  if exists (select 1 from public.payment_submissions s where s.task_id = p_task_id) then
    raise exception 'task_has_payments';
  end if;
  delete from public.tasks where id = p_task_id;
end $$;

-- ---------------------------------------------------------------------
-- System functions (service role / scheduler only)
-- ---------------------------------------------------------------------

-- Expire every task whose deadline has passed. Runs every minute.
create or replace function public.expire_tasks()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  update public.tasks set status = 'expired'
  where status = 'active' and expires_at <= now();
  get diagnostics v_count = row_count;
  delete from public.feed_events where created_at < now() - interval '1 day';
  return v_count;
end $$;

-- Record a report. Called by the server with a reporter key (user id or IP hash).
-- Three distinct reporters pull a live task out of the feed for review.
create or replace function public.report_task(
  p_task_id uuid, p_reporter_id uuid, p_reporter_key text, p_reason text, p_details text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_open integer;
begin
  if p_reporter_key is null or char_length(p_reporter_key) < 8 then
    raise exception 'invalid_reporter';
  end if;
  if not exists (select 1 from public.tasks where id = p_task_id) then
    raise exception 'task_not_found';
  end if;
  if (select count(*) from public.task_reports r
      where r.reporter_key = p_reporter_key and r.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited';
  end if;

  insert into public.task_reports (task_id, reporter_id, reporter_key, reason, details)
  values (p_task_id, p_reporter_id, p_reporter_key, p_reason, nullif(btrim(coalesce(p_details, '')), ''))
  on conflict (task_id, reporter_key) do nothing;

  select count(distinct reporter_key) into v_open
  from public.task_reports where task_id = p_task_id and status = 'open';

  if v_open >= 3 then
    update public.tasks
       set status = 'pending_approval',
           flagged_reason = 'Reported by ' || v_open || ' people'
     where id = p_task_id and status = 'active';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Admin functions
-- ---------------------------------------------------------------------

create or replace function public.admin_approve_payment(p_submission_id uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.require_admin();
  v_sub   public.payment_submissions;
  v_task  public.tasks;
  v_now   timestamptz := now();
begin
  select * into v_sub from public.payment_submissions where id = p_submission_id for update;
  if not found then raise exception 'submission_not_found'; end if;
  if v_sub.status <> 'pending' then raise exception 'submission_already_reviewed'; end if;
  if v_sub.user_id = v_admin then raise exception 'cannot_review_own_payment'; end if;

  select * into v_task from public.tasks where id = v_sub.task_id for update;
  if not found then raise exception 'task_not_found'; end if;
  if v_task.status <> 'pending_payment' then raise exception 'task_not_awaiting_payment'; end if;

  if exists (select 1 from public.verified_payments where reference_normalized = v_sub.reference_normalized) then
    raise exception 'reference_already_used';
  end if;

  insert into public.verified_payments (submission_id, task_id, user_id, amount_cents, currency, reference_normalized, verified_by)
  values (v_sub.id, v_sub.task_id, v_sub.user_id, v_sub.amount_cents, v_sub.currency, v_sub.reference_normalized, v_admin);

  update public.payment_submissions
     set status = 'approved', reviewed_by = v_admin, reviewed_at = v_now, review_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = v_sub.id;

  -- Publish: the countdown starts now, not when the form was filled in.
  update public.tasks
     set status = 'active', published_at = v_now,
         expires_at = v_now + make_interval(mins => duration_minutes),
         rejection_reason = null
   where id = v_task.id;

  perform public.audit('payment.approve', 'payment_submission', v_sub.id::text, jsonb_build_object(
    'task_id', v_task.id, 'amount_cents', v_sub.amount_cents, 'currency', v_sub.currency,
    'reference', v_sub.reference, 'note', p_note));
end $$;

create or replace function public.admin_reject_payment(p_submission_id uuid, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.require_admin();
  v_sub   public.payment_submissions;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_note is null then raise exception 'reason_required'; end if;
  select * into v_sub from public.payment_submissions where id = p_submission_id for update;
  if not found then raise exception 'submission_not_found'; end if;
  if v_sub.status <> 'pending' then raise exception 'submission_already_reviewed'; end if;
  if v_sub.user_id = v_admin then raise exception 'cannot_review_own_payment'; end if;

  update public.payment_submissions
     set status = 'rejected', reviewed_by = v_admin, reviewed_at = now(), review_note = v_note
   where id = v_sub.id;

  -- Back to draft so the poster can pay again with a correct reference.
  update public.tasks set status = 'draft', rejection_reason = 'Payment not confirmed: ' || v_note
   where id = v_sub.task_id and status = 'pending_payment';

  perform public.audit('payment.reject', 'payment_submission', v_sub.id::text,
    jsonb_build_object('task_id', v_sub.task_id, 'reference', v_sub.reference, 'note', v_note));
end $$;

create or replace function public.admin_approve_task(p_task_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.require_admin();
  v_task  public.tasks;
  v_now   timestamptz := now();
begin
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then raise exception 'task_not_found'; end if;
  if v_task.status <> 'pending_approval' then raise exception 'task_not_pending_approval'; end if;
  -- A paid task must have a verified payment before it can go live.
  if not v_task.is_free and not exists (select 1 from public.verified_payments where task_id = v_task.id) then
    raise exception 'payment_not_verified';
  end if;

  update public.tasks
     set status = 'active', published_at = v_now,
         expires_at = v_now + make_interval(mins => duration_minutes),
         flagged_reason = null, rejection_reason = null
   where id = p_task_id;

  update public.task_reports set status = 'dismissed', resolved_by = v_admin, resolved_at = v_now
   where task_id = p_task_id and status = 'open';

  perform public.audit('task.approve', 'task', p_task_id::text, jsonb_build_object('headline', v_task.headline));
end $$;

create or replace function public.admin_reject_task(p_task_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin  uuid := public.require_admin();
  v_task   public.tasks;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is null then raise exception 'reason_required'; end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then raise exception 'task_not_found'; end if;
  if v_task.status in ('rejected') then raise exception 'task_already_rejected'; end if;

  update public.tasks set status = 'rejected', rejection_reason = left(v_reason, 300) where id = p_task_id;

  update public.payment_submissions
     set status = 'rejected', reviewed_by = v_admin, reviewed_at = now(),
         review_note = 'Listing rejected: ' || left(v_reason, 400)
   where task_id = p_task_id and status = 'pending';

  update public.task_reports set status = 'resolved', resolved_by = v_admin, resolved_at = now()
   where task_id = p_task_id and status = 'open';

  perform public.audit('task.reject', 'task', p_task_id::text,
    jsonb_build_object('headline', v_task.headline, 'previous_status', v_task.status, 'reason', v_reason));
end $$;

create or replace function public.admin_update_task(
  p_task_id uuid, p_headline text, p_description text, p_reward_cents integer, p_location text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.require_admin();
  v_task  public.tasks;
  v_headline text := btrim(regexp_replace(coalesce(p_headline, ''), '\s+', ' ', 'g'));
  v_desc     text := btrim(regexp_replace(coalesce(p_description, ''), '\s+', ' ', 'g'));
  v_location text := btrim(regexp_replace(coalesce(p_location, ''), '\s+', ' ', 'g'));
begin
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then raise exception 'task_not_found'; end if;

  update public.tasks
     set headline = v_headline, description = v_desc, reward_cents = p_reward_cents, location = v_location,
         content_hash = public.task_content_hash(v_headline, v_desc, v_location)
   where id = p_task_id;

  perform public.audit('task.edit', 'task', p_task_id::text, jsonb_build_object(
    'before', jsonb_build_object('headline', v_task.headline, 'description', v_task.description,
                                 'reward_cents', v_task.reward_cents, 'location', v_task.location),
    'after',  jsonb_build_object('headline', v_headline, 'description', v_desc,
                                 'reward_cents', p_reward_cents, 'location', v_location)));
end $$;

create or replace function public.admin_delete_task(p_task_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.require_admin();
  v_task  public.tasks;
begin
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then raise exception 'task_not_found'; end if;
  if exists (select 1 from public.payment_submissions where task_id = p_task_id and status = 'approved') then
    -- Keep paid listings for the books; take them down instead.
    raise exception 'task_has_verified_payment';
  end if;
  delete from public.tasks where id = p_task_id;
  perform public.audit('task.delete', 'task', p_task_id::text, jsonb_build_object(
    'headline', v_task.headline, 'status', v_task.status, 'user_id', v_task.user_id));
end $$;

create or replace function public.admin_set_user_status(p_user_id uuid, p_status public.account_status)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.require_admin();
  v_old   public.account_status;
begin
  if p_user_id = v_admin then raise exception 'cannot_change_own_account'; end if;
  select status into v_old from public.profiles where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;

  update public.profiles set status = p_status where id = p_user_id;

  if p_status = 'banned' then
    update public.tasks set status = 'rejected', rejection_reason = 'Account banned'
     where user_id = p_user_id and status in ('draft', 'pending_payment', 'pending_approval', 'active');
    update public.payment_submissions
       set status = 'rejected', reviewed_by = v_admin, reviewed_at = now(), review_note = 'Account banned'
     where user_id = p_user_id and status = 'pending';
  end if;

  perform public.audit('user.status', 'user', p_user_id::text, jsonb_build_object('from', v_old, 'to', p_status));
end $$;

create or replace function public.admin_set_free_bonus(p_user_id uuid, p_bonus integer)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.require_admin();
  v_old   integer;
begin
  select free_posts_bonus into v_old from public.profiles where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  update public.profiles set free_posts_bonus = p_bonus where id = p_user_id;
  perform public.audit('user.free_bonus', 'user', p_user_id::text, jsonb_build_object('from', v_old, 'to', p_bonus));
end $$;

create or replace function public.admin_update_settings(p jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.require_admin();
  v_old   public.platform_settings;
begin
  select * into v_old from public.platform_settings where id = 1 for update;

  update public.platform_settings set
    brand_name           = coalesce(p ->> 'brand_name', brand_name),
    hero_title           = coalesce(p ->> 'hero_title', hero_title),
    hero_subtitle        = coalesce(p ->> 'hero_subtitle', hero_subtitle),
    posting_fee_cents    = coalesce((p ->> 'posting_fee_cents')::integer, posting_fee_cents),
    currency             = coalesce(upper(p ->> 'currency'), currency),
    free_posts           = coalesce((p ->> 'free_posts')::integer, free_posts),
    whish_account_name   = coalesce(p ->> 'whish_account_name', whish_account_name),
    whish_number         = coalesce(p ->> 'whish_number', whish_number),
    payment_instructions = coalesce(p ->> 'payment_instructions', payment_instructions),
    allowed_durations    = coalesce(
      (select array_agg(distinct x::integer order by x::integer) from jsonb_array_elements_text(p -> 'allowed_durations') x),
      allowed_durations),
    auto_publish         = coalesce((p ->> 'auto_publish')::boolean, auto_publish),
    max_tasks_per_hour   = coalesce((p ->> 'max_tasks_per_hour')::integer, max_tasks_per_hour),
    max_tasks_per_day    = coalesce((p ->> 'max_tasks_per_day')::integer, max_tasks_per_day),
    blocked_words        = case when p ? 'blocked_words' then
      (select coalesce(array_agg(distinct lower(btrim(x))), '{}') from jsonb_array_elements_text(p -> 'blocked_words') x where btrim(x) <> '')
      else blocked_words end,
    updated_at           = now()
  where id = 1;

  perform public.audit('settings.update', 'settings', '1', jsonb_build_object('changes', p, 'before', to_jsonb(v_old)));
end $$;

create or replace function public.admin_resolve_report(p_report_id uuid, p_status public.report_status)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin  uuid := public.require_admin();
  v_report public.task_reports;
begin
  if p_status = 'open' then raise exception 'invalid_status'; end if;
  select * into v_report from public.task_reports where id = p_report_id for update;
  if not found then raise exception 'report_not_found'; end if;
  update public.task_reports set status = p_status, resolved_by = v_admin, resolved_at = now() where id = p_report_id;
  perform public.audit('report.' || p_status::text, 'task_report', p_report_id::text,
    jsonb_build_object('task_id', v_report.task_id, 'reason', v_report.reason));
end $$;

create or replace function public.admin_stats()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_admin uuid := public.require_admin();
  v_today timestamptz := date_trunc('day', now());
begin
  return jsonb_build_object(
    'users',            (select count(*) from public.profiles),
    'active_tasks',     (select count(*) from public.tasks where status = 'active' and expires_at > now()),
    'tasks_today',      (select count(*) from public.tasks where created_at >= v_today and status <> 'draft'),
    'taken_tasks',      (select count(*) from public.tasks where status = 'taken'),
    'expired_tasks',    (select count(*) from public.tasks where status = 'expired'),
    'pending_approval', (select count(*) from public.tasks where status = 'pending_approval'),
    'pending_payments', (select count(*) from public.payment_submissions where status = 'pending'),
    'open_reports',     (select count(*) from public.task_reports where status = 'open'),
    'paid_postings',    (select count(*) from public.verified_payments),
    'revenue',          coalesce((
      select jsonb_object_agg(currency, total) from (
        select currency, sum(amount_cents) as total from public.verified_payments group by currency
      ) r), '{}'::jsonb),
    'revenue_today',    coalesce((
      select jsonb_object_agg(currency, total) from (
        select currency, sum(amount_cents) as total from public.verified_payments
        where verified_at >= v_today group by currency
      ) r), '{}'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.platform_settings   enable row level security;
alter table public.profiles            enable row level security;
alter table public.tasks               enable row level security;
alter table public.task_contacts       enable row level security;
alter table public.free_post_usage     enable row level security;
alter table public.payment_submissions enable row level security;
alter table public.verified_payments   enable row level security;
alter table public.task_reports        enable row level security;
alter table public.admin_audit_logs    enable row level security;
alter table public.feed_events         enable row level security;

-- Settings: everyone can read (fee, Whish details, durations, homepage text).
create policy settings_read on public.platform_settings for select using (true);

-- Profiles: yourself, or an admin.
create policy profiles_read_own on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Tasks: live ones are public; owners see their own; admins see all.
create policy tasks_read_live on public.tasks for select
  using (status = 'active' and expires_at > now());
create policy tasks_read_own on public.tasks for select using (user_id = auth.uid());
create policy tasks_read_admin on public.tasks for select using (public.is_admin());

create policy contacts_read on public.task_contacts for select using (
  public.is_admin() or exists (select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid())
);

create policy free_usage_read on public.free_post_usage for select using (user_id = auth.uid() or public.is_admin());

create policy submissions_read on public.payment_submissions for select using (user_id = auth.uid() or public.is_admin());
create policy verified_read on public.verified_payments for select using (user_id = auth.uid() or public.is_admin());

create policy reports_read on public.task_reports for select using (public.is_admin());
create policy audit_read on public.admin_audit_logs for select using (public.is_admin());

create policy feed_events_read on public.feed_events for select using (true);

-- ---------------------------------------------------------------------
-- Privileges: reads go through RLS; writes go through the functions above.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select on public.platform_settings, public.tasks, public.feed_events to anon, authenticated;
grant select on public.profiles, public.task_contacts, public.free_post_usage,
                public.payment_submissions, public.verified_payments,
                public.task_reports, public.admin_audit_logs to authenticated;
-- A user may change only their own name and photo; never role, status or quotas.
grant update (display_name, avatar_url) on public.profiles to authenticated;

-- Helpers used inside RLS policies must be callable by the querying role.
grant execute on function public.is_admin() to anon, authenticated;

grant execute on function public.my_posting_quota()                   to authenticated;
grant execute on function public.create_task(text, text, integer, text, text, integer, text, uuid) to authenticated;
grant execute on function public.submit_payment(uuid, text, text)     to authenticated;
grant execute on function public.mark_task_taken(uuid)                to authenticated;
grant execute on function public.discard_draft(uuid)                  to authenticated;

grant execute on function public.admin_approve_payment(uuid, text)    to authenticated;
grant execute on function public.admin_reject_payment(uuid, text)     to authenticated;
grant execute on function public.admin_approve_task(uuid)             to authenticated;
grant execute on function public.admin_reject_task(uuid, text)        to authenticated;
grant execute on function public.admin_update_task(uuid, text, text, integer, text) to authenticated;
grant execute on function public.admin_delete_task(uuid)              to authenticated;
grant execute on function public.admin_set_user_status(uuid, public.account_status) to authenticated;
grant execute on function public.admin_set_free_bonus(uuid, integer)  to authenticated;
grant execute on function public.admin_update_settings(jsonb)         to authenticated;
grant execute on function public.admin_resolve_report(uuid, public.report_status) to authenticated;
grant execute on function public.admin_stats()                        to authenticated;

-- expire_tasks and report_task: service role only (the server and the scheduler).
grant execute on function public.expire_tasks() to service_role;
grant execute on function public.report_task(uuid, uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------
-- Realtime, storage, scheduler (Supabase-specific; skipped elsewhere)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.feed_events;
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
      ('task-images',    'task-images',    true,  5242880, array['image/webp', 'image/jpeg', 'image/png']),
      ('avatars',        'avatars',        true,  2097152, array['image/webp', 'image/jpeg', 'image/png']),
      ('payment-proofs', 'payment-proofs', false, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
    on conflict (id) do nothing;
  end if;
end $$;

-- Expire tasks every minute with pg_cron when it is available.
-- (The app also hides expired tasks on read and exposes /api/cron/expire.)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      execute 'create extension if not exists pg_cron';
      perform cron.schedule('yalla-ok-expire-tasks', '* * * * *', 'select public.expire_tasks()');
    exception when others then
      raise notice 'pg_cron not scheduled: %', sqlerrm;
    end;
  end if;
end $$;
