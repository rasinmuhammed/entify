create extension if not exists pgcrypto;

-- Canonical bootstrap schema for local/dev Supabase environments.
-- Keep this file aligned with the checked-in migrations so a fresh setup matches
-- the fields the current frontend writes today.

create table if not exists datasets (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  row_count integer,
  columns jsonb default '[]'::jsonb,
  file_path text,
  cleaned_file_path text,
  primary_key_column text,
  cleaning_status text default 'raw' check (cleaning_status in ('raw', 'cleaning', 'cleaned')),
  cleaning_metadata jsonb,
  data_quality_score numeric(5,2),
  user_id text
);

create table if not exists jobs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  job_id text not null,
  status text not null,
  dataset_id uuid references datasets(id) on delete cascade,
  result_summary jsonb,
  user_id text
);

create table if not exists projects (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  description text,
  status text default 'draft',
  step text default 'overview',
  dataset_id uuid references datasets(id) on delete cascade,
  configuration jsonb default '{}'::jsonb,
  user_id text,
  active_phase text default 'profile',
  last_updated timestamp with time zone default timezone('utc'::text, now()),
  blocking_rules jsonb default '[]'::jsonb,
  comparisons jsonb default '[]'::jsonb,
  comparison_config jsonb default '[]'::jsonb,
  global_settings jsonb default '{"probability_two_random_records_match": 0.0001}'::jsonb,
  threshold numeric default 0.5,
  laboratory_settings jsonb default '{}'::jsonb,
  original_file_path text,
  cleaned_file_path text,
  cleaning_applied boolean default false,
  cleaning_stats jsonb default '{}'::jsonb
);

create index if not exists idx_projects_active_phase on projects(active_phase);
create index if not exists idx_projects_last_updated on projects(last_updated desc);
create index if not exists idx_projects_cleaning_applied on projects(cleaning_applied);
create index if not exists idx_datasets_cleaning_status on datasets(cleaning_status);

alter table datasets enable row level security;
alter table jobs enable row level security;
alter table projects enable row level security;

drop policy if exists "Allow public access" on datasets;
drop policy if exists "Allow public access" on jobs;
drop policy if exists "Allow public access" on projects;

create policy "Allow public access" on datasets for all using (true);
create policy "Allow public access" on jobs for all using (true);
create policy "Allow public access" on projects for all using (true);
