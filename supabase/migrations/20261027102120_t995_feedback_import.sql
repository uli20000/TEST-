-- Historical feedback imports used by the operations dashboard (0800, 4128 and GES).
create table if not exists public.t995_feedback_import_rows (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('0800','4128','GES')),
  source_key text not null check (btrim(source_key) <> ''),
  source_file text not null,
  record_date date,
  period_start date,
  period_end date,
  area_name text,
  store_code text,
  restaurant_name text,
  source_channel text,
  feedback_kind text,
  complaint_type text,
  main_topic text,
  item_1 text,
  item_2 text,
  content text,
  invoice_number text,
  order_number text,
  work_order text,
  followup_status text,
  response_count integer check (response_count is null or response_count >= 0),
  score_1sat numeric,
  osat_survey numeric,
  osat_google numeric,
  osat_delivery numeric,
  score_accuracy numeric,
  score_environment numeric,
  score_service numeric,
  score_speed numeric,
  score_food numeric,
  raw_fields jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_fields) = 'object'),
  imported_by uuid references auth.users(id),
  imported_at timestamptz not null default now(),
  unique (source_type, source_key),
  check (period_start is null or period_end is null or period_start <= period_end)
);

create index if not exists t995_feedback_import_rows_date_idx
  on public.t995_feedback_import_rows(source_type, record_date, restaurant_name);
create index if not exists t995_feedback_import_rows_period_idx
  on public.t995_feedback_import_rows(source_type, period_start, period_end);

alter table public.t995_feedback_import_rows enable row level security;
revoke all on public.t995_feedback_import_rows from anon, authenticated;
grant select, insert, update on public.t995_feedback_import_rows to authenticated;
drop policy if exists t995_feedback_import_rows_admin on public.t995_feedback_import_rows;
create policy t995_feedback_import_rows_admin
  on public.t995_feedback_import_rows
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
