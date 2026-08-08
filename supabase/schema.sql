-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
-- Mirrors the old SQLite schema, translated to Postgres types.

create table if not exists users (
  id text primary key,
  created_at timestamptz not null default now(),
  last_lat double precision,
  last_lng double precision
);

create table if not exists letters (
  id text primary key,
  title text,
  text text not null,
  word_count integer not null,
  preview_line text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  hands_count integer not null default 0,
  total_distance_km double precision not null default 0,
  upvotes integer not null default 0,
  downvotes integer not null default 0,
  origin_user_id text not null
);

-- Every time a letter lands somewhere (initial write, manual redrop, or auto-redrop)
create table if not exists drop_events (
  id text primary key,
  letter_id text not null references letters(id),
  user_id text not null,
  lat double precision not null,
  lng double precision not null,
  dropped_at timestamptz not null default now(),
  is_auto_redrop boolean not null default false
);

-- Every time a letter is picked up. redropped_at IS NULL means user is currently holding it.
create table if not exists pickup_events (
  id text primary key,
  letter_id text not null references letters(id),
  user_id text not null,
  picked_up_at timestamptz not null default now(),
  reaction text,
  redropped_at timestamptz
);

create table if not exists reports (
  id text primary key,
  letter_id text not null,
  reason text,
  reported_by text,
  created_at timestamptz not null default now()
);

-- The server connects with the service_role key, which bypasses Row Level
-- Security entirely — so RLS doesn't need to be configured for this app to
-- work. If you ever call Supabase directly from the browser with the
-- publishable/anon key, enable RLS + policies on these tables first.
