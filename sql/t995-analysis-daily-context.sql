-- Daily score exclusions and notes, plus sourced coupon campaign records.
alter table public.t995_operations_daily_reports
  add column if not exists score_excluded boolean not null default false,
  add column if not exists special_notes text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 't995_operations_special_notes_length'
      and conrelid = 'public.t995_operations_daily_reports'::regclass
  ) then
    alter table public.t995_operations_daily_reports
      add constraint t995_operations_special_notes_length
      check (length(special_notes) <= 2000);
  end if;
end;
$$;

create table if not exists public.t995_operations_coupon_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_name text not null check (length(trim(campaign_name)) between 1 and 160),
  details text not null default '' check (length(details) <= 1000),
  active_from date not null,
  active_to date not null,
  source_url text not null check (source_url ~ '^https?://'),
  researched_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint t995_coupon_campaign_dates check (active_to >= active_from),
  constraint t995_coupon_campaign_unique unique (campaign_name, active_from, active_to, source_url)
);

create index if not exists t995_coupon_campaign_active_dates_idx
  on public.t995_operations_coupon_campaigns(active_from, active_to);

alter table public.t995_operations_coupon_campaigns enable row level security;
revoke all on public.t995_operations_coupon_campaigns from anon, authenticated;
grant select, insert, update, delete on public.t995_operations_coupon_campaigns to authenticated;
grant all on public.t995_operations_coupon_campaigns to service_role;
drop policy if exists t995_coupon_campaigns_admin on public.t995_operations_coupon_campaigns;
create policy t995_coupon_campaigns_admin
  on public.t995_operations_coupon_campaigns
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- The user identified these closure days as excluded from score comparison.
insert into public.t995_operations_daily_reports(record_date, score_excluded, special_notes)
values
  ('2026-10-23', true, '停班課'),
  ('2026-10-24', true, '停班課')
on conflict(record_date) do update set
  score_excluded = true,
  special_notes = case
    when position('停班課' in public.t995_operations_daily_reports.special_notes) > 0
      then public.t995_operations_daily_reports.special_notes
    when nullif(trim(public.t995_operations_daily_reports.special_notes), '') is null
      then '停班課'
    else public.t995_operations_daily_reports.special_notes || '；停班課'
  end,
  updated_at = now();

-- Public weekly KFC campaign found for 2026-10-27 through 2026-11-01.
insert into public.t995_operations_coupon_campaigns
  (campaign_name, details, active_from, active_to, source_url)
values
  ('雙11 111 元超值餐', '10/27–11/23：三款 111 元個人餐，優惠代碼 50560、50495、50562。10/27–11/16：兩款 299 元多人餐。指定點心與飲料另有買一送一；PK APP 新會員限量滿 399 折 111，依券別與通路條件使用。', '2026-10-27', '2026-11-23',
   'https://tw.news.yahoo.com/%E9%9B%9911-%E8%90%AC%E8%81%96%E7%AF%80%E9%A4%90%E9%A3%B2%E7%A5%AD%E5%84%AA%E6%83%A0-%E8%82%AF%E5%BE%B7%E5%9F%BA111%E5%85%83%E9%96%8B%E5%90%83-%E6%BC%A2%E5%A0%A1%E7%8E%8B%E5%A5%97%E9%A4%90%E7%9C%8168%E5%85%83-%E6%8B%89%E4%BA%9E%E8%81%AF%E5%90%8D%E4%B8%89%E5%9C%8B%E7%84%A1%E9%9B%99-010200621.html')
on conflict(campaign_name, active_from, active_to, source_url) do nothing;
