-- Bank accounts with confirmed balances; cash "now" = sum(balance) + movements after settings.balances_as_of
create table if not exists public.accounts (id text primary key, name text not null, who text, balance numeric not null default 0, sort int default 0, updated_at timestamptz default now());
alter table public.accounts enable row level security;
create policy members_all on public.accounts for all using (public.is_member()) with check (public.is_member());
alter publication supabase_realtime add table public.accounts;
