-- Create a table for uploaded datasets
create table datasets (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  row_count integer,
  file_path text, -- Path in backend storage or Supabase Storage
  user_id text -- Clerk User ID
);

-- Create a table for match jobs
create table jobs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  job_id text not null, -- Backend Job ID
  status text not null, -- pending, running, completed, failed
  dataset_id uuid references datasets(id),
  result_summary jsonb,
  user_id text -- Clerk User ID
);

-- Create a table for projects
create table projects (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  description text,
  status text default 'draft', -- draft, processing, completed
  step text default 'overview', -- overview, configure, process, review
  dataset_id uuid references datasets(id),
  configuration jsonb, -- Splink settings
  user_id text, -- Clerk User ID
  active_phase text default 'profile',
  last_updated timestamp with time zone default timezone('utc'::text, now()),
  blocking_rules jsonb default '[]'::jsonb,
  comparison_config jsonb default '[]'::jsonb
);

-- Enable Row Level Security (RLS)
alter table datasets enable row level security;
alter table jobs enable row level security;
alter table projects enable row level security;

-- Create policies (allow all for now for simplicity, or restrict to user_id)
create policy "Allow public access" on datasets for all using (true);
create policy "Allow public access" on jobs for all using (true);
create policy "Allow public access" on projects for all using (true);
