-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Posts table
create table if not exists public.posts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  platforms text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','scheduled','published','failed')),
  scheduled_at timestamptz,
  published_at timestamptz,
  media_urls text[] not null default '{}',
  platform_post_ids jsonb not null default '{}',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.posts enable row level security;

create policy "Users manage own posts" on public.posts
  for all using (auth.uid() = user_id);

-- Connected accounts table
create table if not exists public.connected_accounts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('facebook','instagram','linkedin','houzz')),
  account_name text not null,
  account_id text not null,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  page_id text,
  page_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform, account_id)
);

alter table public.connected_accounts enable row level security;

create policy "Users manage own accounts" on public.connected_accounts
  for all using (auth.uid() = user_id);

-- Media files table
create table if not exists public.media_files (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_size bigint not null,
  mime_type text not null,
  storage_path text not null,
  public_url text not null,
  created_at timestamptz not null default now()
);

alter table public.media_files enable row level security;

create policy "Users manage own media" on public.media_files
  for all using (auth.uid() = user_id);

-- Auto-update updated_at
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger posts_updated_at before update on public.posts
  for each row execute function public.handle_updated_at();

create trigger accounts_updated_at before update on public.connected_accounts
  for each row execute function public.handle_updated_at();

-- Supabase Storage: create bucket
insert into storage.buckets (id, name, public) values ('media', 'media', true)
  on conflict do nothing;

create policy "Users upload own media" on storage.objects
  for insert with check (bucket_id = 'media' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users read own media" on storage.objects
  for select using (bucket_id = 'media' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users delete own media" on storage.objects
  for delete using (bucket_id = 'media' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Public media read" on storage.objects
  for select using (bucket_id = 'media');
