create table if not exists public.analysis_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  input_data jsonb not null,
  result_data jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'skipped', 'purchased', 'secondhand')),
  estimated_carbon_kg numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.analysis_records add column if not exists eco_tip_applied boolean not null default false;

alter table public.analysis_records enable row level security;

create policy "Users can view their own analysis records"
  on public.analysis_records for select
  using (auth.uid() = user_id);

create policy "Users can insert their own analysis records"
  on public.analysis_records for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own analysis records"
  on public.analysis_records for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  analysis_record_id uuid not null references public.analysis_records(id) on delete cascade,
  email text not null,
  item_name text not null,
  price numeric not null default 0,
  remind_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table public.reminders enable row level security;

create policy "Users can view their own reminders"
  on public.reminders for select
  using (auth.uid() = user_id);

create policy "Users can create their own reminders"
  on public.reminders for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own reminders"
  on public.reminders for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('income', 'expense')),
  amount numeric not null check (amount > 0),
  description text not null check (char_length(trim(description)) between 1 and 80),
  created_at timestamptz not null default now()
);

create index if not exists ledger_transactions_user_created_idx
  on public.ledger_transactions (user_id, created_at desc);

alter table public.ledger_transactions enable row level security;

drop policy if exists "Users can view their own ledger transactions" on public.ledger_transactions;
create policy "Users can view their own ledger transactions"
  on public.ledger_transactions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own ledger transactions" on public.ledger_transactions;
create policy "Users can insert their own ledger transactions"
  on public.ledger_transactions for insert
  with check (auth.uid() = user_id);
