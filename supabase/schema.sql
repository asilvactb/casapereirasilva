-- Casa Pereira Silva — database schema
-- Only the two household members can read or write anything.

create extension if not exists pgcrypto;

-- Who may use the app (by login email) and which person they are.
create table if not exists members (
  email text primary key,
  who   text not null check (who in ('alexandre','rita')),
  name  text not null
);

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where email = lower(coalesce(auth.jwt() ->> 'email','')));
$$;

create or replace function public.my_who() returns text
language sql stable security definer set search_path = public as $$
  select who from members where email = lower(coalesce(auth.jwt() ->> 'email',''));
$$;

-- Key/value settings (due date, family calendar, cycle day…)
create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Recurring monthly items (incomes and fixed expenses)
create table if not exists fixed_items (
  id text primary key default gen_random_uuid()::text,
  kind text not null check (kind in ('income','expense')),
  name text not null,
  amount numeric(12,2) not null default 0,
  cat text,
  pay_day int check (pay_day between 1 and 31),
  start_cycle text,          -- 'YYYY-MM' (cycle key)
  end_cycle text,            -- 'YYYY-MM' or null
  who text,
  note text,
  created_at timestamptz not null default now()
);

-- Which fixed items were paid in a cycle
create table if not exists fixed_paid (
  cycle text not null,
  item_id text not null references fixed_items(id) on delete cascade,
  paid_at timestamptz not null default now(),
  primary key (cycle, item_id)
);

-- One-off income and day-to-day spending
create table if not exists transactions (
  id text primary key default gen_random_uuid()::text,
  type text not null check (type in ('despesa','receita')),
  amount numeric(12,2) not null,
  descr text,
  cat text,
  date date not null,
  cycle text not null,
  who text,
  created_at timestamptz not null default now()
);
create index if not exists transactions_cycle_idx on transactions(cycle);

create table if not exists budget (
  cat text primary key,
  monthly_limit numeric(12,2) not null default 0,
  sort int not null default 0
);

create table if not exists savings (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  target numeric(12,2) not null default 0,
  saved numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  who text not null default 'ambos',
  cat text,
  due date,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists goals (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  horizon text not null default 'curto' check (horizon in ('curto','medio','longo')),
  area text,
  who text not null default 'ambos',
  progress int not null default 0 check (progress between 0 and 100),
  created_at timestamptz not null default now()
);

create table if not exists shopping (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  qty text,
  sec text not null default 'Outros',
  done boolean not null default false,
  done_at timestamptz,
  who text,
  created_at timestamptz not null default now()
);

create table if not exists shopping_freq (
  name text primary key,
  sec text,
  times int not null default 1
);

create table if not exists milestones (
  key text primary key,
  done boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Calendar feeds (secret iCal addresses). Readable by members, never public.
create table if not exists calendar_sources (
  id text primary key default gen_random_uuid()::text,
  who text not null check (who in ('alexandre','rita','familia')),
  label text not null,
  ics_url text not null,
  last_sync timestamptz,
  last_error text
);

-- Events pulled from the feeds by the sync function, plus events created in the app.
create table if not exists events (
  id text primary key,             -- source_id:uid:start for feeds, uuid for app events
  source_id text,                  -- null for events created in the app
  who text not null,               -- alexandre | rita | familia
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  location text,
  synced_at timestamptz not null default now()
);
create index if not exists events_starts_idx on events(starts_at);

-- RLS: every table is members-only
do $$
declare t text;
begin
  foreach t in array array['settings','fixed_items','fixed_paid','transactions','budget','savings','tasks','goals',
                           'shopping','shopping_freq','milestones','calendar_sources','events','members']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists members_all on %I', t);
    if t = 'members' then
      execute format('create policy members_all on %I for select to authenticated using (public.is_member())', t);
    else
      execute format('create policy members_all on %I for all to authenticated using (public.is_member()) with check (public.is_member())', t);
    end if;
  end loop;
end $$;

-- Realtime for live updates between the two phones
do $$
declare t text;
begin
  foreach t in array array['fixed_items','fixed_paid','transactions','budget','savings','tasks','goals','shopping',
                           'shopping_freq','milestones','events','settings']
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
