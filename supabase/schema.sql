-- ============================================================================
-- Ogen intake + office pipeline — Supabase schema
-- ============================================================================
-- Run this ONCE in the Supabase project (Dashboard → SQL Editor → New query →
-- paste → Run). It creates the table the chat writes to and the office reads
-- from. Safe to re-run (uses IF NOT EXISTS / idempotent policies).
--
-- Project: https://dhrctqjxbdlwfxabinbr.supabase.co
-- ----------------------------------------------------------------------------

-- The table every chat submission is stored in (and the office inbox + cases
-- board read from). `data` holds the whole submission (fields, files, chat).
create table if not exists public.agent_submissions (
  id         uuid primary key default gen_random_uuid(),
  kind       text,                       -- 'family' | 'worker' | 'config'
  source     text,                       -- 'chat' | 'office' | …
  status     text default 'new',         -- 'chat'(in progress) | 'new' | 'imported' | 'dismissed' | 'config'
  data       jsonb default '{}'::jsonb,  -- fields, files (base64), transcript, meta, signRequestId…
  created_at timestamptz default now()
);

create index if not exists agent_submissions_status_idx      on public.agent_submissions (status);
create index if not exists agent_submissions_created_at_idx  on public.agent_submissions (created_at desc);

-- The public chat writes with the anon key, so allow anon access. The link is
-- protected by being unguessable, not by auth (this is an intake form).
alter table public.agent_submissions enable row level security;

drop policy if exists "agent_submissions anon select" on public.agent_submissions;
drop policy if exists "agent_submissions anon insert" on public.agent_submissions;
drop policy if exists "agent_submissions anon update" on public.agent_submissions;

create policy "agent_submissions anon select" on public.agent_submissions for select using (true);
create policy "agent_submissions anon insert" on public.agent_submissions for insert with check (true);
create policy "agent_submissions anon update" on public.agent_submissions for update using (true) with check (true);

-- Tell PostgREST to pick up the new table immediately.
notify pgrst, 'reload schema';
