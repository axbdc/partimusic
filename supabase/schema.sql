-- Partimusic — esquema Supabase
-- Correr no SQL Editor do projeto Supabase (uma vez).

-- 1) Administradores -------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
drop policy if exists "admins leem o proprio registo" on public.admins;
create policy "admins leem o proprio registo" on public.admins
  for select using (auth.uid() = user_id);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- 2) Partituras ------------------------------------------------------------
create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  composer text,
  instruments text[] not null default '{violin}',
  level text not null default 'iniciante',
  style text not null default 'classico',
  bpm int,
  description text,
  status text not null default 'pending' check (status in ('draft','pending','published')),
  solo_parts jsonb not null default '{}'::jsonb,
  has_accompaniment boolean default false,
  xml_path text,
  pdf_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.scores enable row level security;

drop policy if exists "publico ve publicadas" on public.scores;
create policy "publico ve publicadas" on public.scores
  for select using (status = 'published' or public.is_admin());

drop policy if exists "admin escreve" on public.scores;
create policy "admin escreve" on public.scores
  for all using (public.is_admin()) with check (public.is_admin());

-- 3) Estado do utilizador (favoritos, progresso, prática) -----------------
create table if not exists public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_state enable row level security;
drop policy if exists "dono" on public.user_state;
create policy "dono" on public.user_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4) Storage: bucket publico para os ficheiros -----------------------------
insert into storage.buckets (id, name, public)
values ('scores', 'scores', true)
on conflict (id) do nothing;

drop policy if exists "admin upload" on storage.objects;
create policy "admin upload" on storage.objects
  for insert with check (bucket_id = 'scores' and public.is_admin());
drop policy if exists "admin update" on storage.objects;
create policy "admin update" on storage.objects
  for update using (bucket_id = 'scores' and public.is_admin());
drop policy if exists "admin delete" on storage.objects;
create policy "admin delete" on storage.objects
  for delete using (bucket_id = 'scores' and public.is_admin());

-- 5) Tornar-te admin --------------------------------------------------------
-- Depois de criares o teu utilizador em Authentication > Users, corre:
-- insert into public.admins (user_id)
--   select id from auth.users where email = 'O_TEU_EMAIL';
