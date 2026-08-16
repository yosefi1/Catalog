-- Run this in Supabase SQL Editor (once).

create table if not exists public.devices (
  inventory_id text primary key,
  device_name text not null default '',
  manufacturer text not null default '',
  model text not null default '',
  serial_number text not null default '',
  asset_tag text not null default '',
  device_type text not null default '',
  location text not null default '',
  room text not null default '',
  area text not null default '',
  owner text not null default '',
  notes text not null default '',
  created_at bigint not null,
  updated_at bigint not null
);

create index if not exists devices_updated_at_idx on public.devices (updated_at desc);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  inventory_id text not null references public.devices (inventory_id) on delete cascade,
  photo_type text not null,
  storage_path text not null unique,
  mime_type text not null default 'image/jpeg',
  created_at bigint not null
);

create index if not exists photos_inventory_id_idx on public.photos (inventory_id);

-- Storage bucket (also create via Dashboard → Storage if insert fails)
insert into storage.buckets (id, name, public)
values ('device-photos', 'device-photos', false)
on conflict (id) do nothing;

-- Lock down: only service role (used by Vercel API) should access data.
alter table public.devices enable row level security;
alter table public.photos enable row level security;

-- No anon policies on purpose. Client never talks to Supabase directly.
