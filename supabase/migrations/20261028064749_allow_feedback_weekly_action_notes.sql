alter table public.t995_weekly_metric_action_notes
  drop constraint if exists t995_weekly_metric_action_notes_metric_key_check;

alter table public.t995_weekly_metric_action_notes
  add constraint t995_weekly_metric_action_notes_metric_key_check
  check (metric_key in ('sstg', 'd7', 'd25', 'fa', 'waiting', 'feedback'));
