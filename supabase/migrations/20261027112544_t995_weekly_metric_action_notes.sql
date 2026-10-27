-- One editable action-tracking record per metric and Monday-based week.
create table if not exists public.t995_weekly_metric_action_notes (
  week_start date not null,
  metric_key text not null check (metric_key in ('sstg','d7','d25','fa','waiting')),
  issue text not null default '',
  evidence text not null default '',
  root_cause text not null default '',
  action_plan text not null default '',
  last_week_followup text not null default '',
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (week_start, metric_key),
  check (extract(isodow from week_start) = 1)
);

create index if not exists t995_weekly_metric_action_notes_week_idx
  on public.t995_weekly_metric_action_notes (week_start desc);

alter table public.t995_weekly_metric_action_notes enable row level security;
revoke all on public.t995_weekly_metric_action_notes from anon, authenticated;
grant select, insert, update on public.t995_weekly_metric_action_notes to authenticated;

drop policy if exists t995_weekly_metric_action_notes_admin
  on public.t995_weekly_metric_action_notes;
create policy t995_weekly_metric_action_notes_admin
  on public.t995_weekly_metric_action_notes
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
