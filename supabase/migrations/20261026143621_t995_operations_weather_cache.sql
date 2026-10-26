create table if not exists public.t995_operations_weather_months (
  month date primary key check (extract(day from month)=1),
  payload jsonb not null check (jsonb_typeof(payload)='array'),
  fetched_at timestamptz not null default now()
);
alter table public.t995_operations_weather_months enable row level security;
revoke all on public.t995_operations_weather_months from anon, authenticated;
grant select on public.t995_operations_weather_months to authenticated;
grant select,insert,update,delete on public.t995_operations_weather_months to service_role;
create policy t995_weather_admin_read on public.t995_operations_weather_months
for select to authenticated using ((select public.is_admin()));
comment on table public.t995_operations_weather_months is 'CODiS observed daily weather cache. Edge function writes after administrator authorization; source station and missing status retained.';
