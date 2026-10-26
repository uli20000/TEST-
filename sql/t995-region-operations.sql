-- Daily region hours and shared center-level adjustments.
-- Existing per-store hours are retained; nonzero legacy hours are backfilled once by area.
create table if not exists public.t995_operations_daily_reports (
  record_date date primary key,
  area_hours jsonb not null default '{}'::jsonb check(jsonb_typeof(area_hours)='object'),
  transfer_out_hours numeric(10,2) not null default 0 check(transfer_out_hours>=0),
  transfer_in_hours numeric(10,2) not null default 0 check(transfer_in_hours>=0),
  weather text not null default '' check(length(weather)<=30),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.t995_operations_daily_reports enable row level security;
drop policy if exists t995_operations_reports_read on public.t995_operations_daily_reports;
create policy t995_operations_reports_read on public.t995_operations_daily_reports for select to authenticated using(true);
revoke all on public.t995_operations_daily_reports from anon,authenticated;
grant select on public.t995_operations_daily_reports to authenticated;

create or replace function public.t995_save_operations_report(
  p_record_date date,
  p_area_code text default null,
  p_area_hours numeric default null,
  p_transfer_out numeric default null,
  p_transfer_in numeric default null,
  p_weather text default null
) returns public.t995_operations_daily_reports
language plpgsql security definer set search_path=public
as $$
declare result public.t995_operations_daily_reports;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_record_date is null then raise exception 'Report date required'; end if;
  if p_area_code is not null and p_area_code !~ '^[A-K]$' then raise exception 'Invalid area'; end if;
  if p_area_hours is not null and (p_area_hours<0 or p_area_hours>9999 or p_area_hours::text in ('NaN','Infinity','-Infinity')) then raise exception 'Invalid area hours'; end if;
  if p_transfer_out is not null and (p_transfer_out<0 or p_transfer_out>9999 or p_transfer_out::text in ('NaN','Infinity','-Infinity')) then raise exception 'Invalid transfer-out hours'; end if;
  if p_transfer_in is not null and (p_transfer_in<0 or p_transfer_in>9999 or p_transfer_in::text in ('NaN','Infinity','-Infinity')) then raise exception 'Invalid transfer-in hours'; end if;
  if p_weather is not null and length(p_weather)>30 then raise exception 'Weather must be at most 30 characters'; end if;
  insert into public.t995_operations_daily_reports(record_date) values(p_record_date) on conflict(record_date) do nothing;
  update public.t995_operations_daily_reports set
    area_hours=case when p_area_code is null then area_hours when p_area_hours is null then area_hours-p_area_code else jsonb_set(area_hours,array[p_area_code],to_jsonb(round(p_area_hours,2)),true) end,
    transfer_out_hours=coalesce(p_transfer_out,transfer_out_hours),
    transfer_in_hours=coalesce(p_transfer_in,transfer_in_hours),
    weather=coalesce(p_weather,weather),updated_by=auth.uid(),updated_at=now()
  where record_date=p_record_date returning * into result;
  return result;
end $$;
revoke all on function public.t995_save_operations_report(date,text,numeric,numeric,numeric,text) from public,anon;
grant execute on function public.t995_save_operations_report(date,text,numeric,numeric,numeric,text) to authenticated;

with legacy as (
  select h.record_date,m.area_code,sum(h.total_hours) as hours,
    sum(h.transfer_out_hours) as out_hours,sum(h.transfer_in_hours) as in_hours
  from public.t995_score_labor_hours h
  join public.t995_restaurants r on r.store_code=h.store_code
  join public.tc_restaurant_area_map m on m.restaurant_name=r.restaurant_name and m.is_active
  where h.total_hours<>0 or h.transfer_out_hours<>0 or h.transfer_in_hours<>0
  group by h.record_date,m.area_code
)
insert into public.t995_operations_daily_reports(record_date,area_hours,transfer_out_hours,transfer_in_hours)
select record_date,jsonb_object_agg(area_code,hours),sum(out_hours),sum(in_hours) from legacy group by record_date
on conflict(record_date) do nothing;
