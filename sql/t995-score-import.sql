-- 每日營運成績報表匯入與歷史查詢。Supabase SQL Editor 執行一次。
create table if not exists public.t995_score_import_batches (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  report_type text not null check (report_type in ('ByDate','ByOrder')),
  source_file text not null,
  row_count integer not null default 0 check (row_count >= 0),
  uploaded_by uuid references auth.users(id),
  imported_at timestamptz not null default now()
);
create index if not exists t995_score_import_batches_date_idx
  on public.t995_score_import_batches(report_date desc, imported_at desc);

create table if not exists public.t995_score_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.t995_score_import_batches(id) on delete cascade,
  row_number integer not null,
  record_date text,
  store_code text,
  restaurant_name text,
  order_number text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(batch_id,row_number)
);
create index if not exists t995_score_import_rows_batch_idx
  on public.t995_score_import_rows(batch_id,row_number);
create index if not exists t995_score_import_rows_search_idx
  on public.t995_score_import_rows(store_code,order_number);

alter table public.t995_score_import_batches enable row level security;
alter table public.t995_score_import_rows enable row level security;
revoke all on public.t995_score_import_batches,public.t995_score_import_rows from anon,authenticated;
grant select,insert on public.t995_score_import_batches to authenticated;
grant select,insert on public.t995_score_import_rows to authenticated;
drop policy if exists t995_score_batches_authenticated on public.t995_score_import_batches;
create policy t995_score_batches_authenticated on public.t995_score_import_batches
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists t995_score_rows_authenticated on public.t995_score_import_rows;
create policy t995_score_rows_authenticated on public.t995_score_import_rows
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

create or replace function public.t995_import_score_batch(
  p_report_date date,
  p_report_type text,
  p_source_file text,
  p_rows jsonb
) returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_batch_id uuid;
  v_count integer;
begin
  if auth.uid() is null then raise exception '請先登入管理後台'; end if;
  if p_report_type not in ('ByDate','ByOrder') then raise exception '不支援的報表類型'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception '沒有可匯入的資料列'; end if;
  v_count:=jsonb_array_length(p_rows);
  insert into public.t995_score_import_batches(report_date,report_type,source_file,row_count,uploaded_by)
  values(p_report_date,p_report_type,left(coalesce(p_source_file,'未命名檔案'),255),v_count,auth.uid())
  returning id into v_batch_id;
  insert into public.t995_score_import_rows(batch_id,row_number,record_date,store_code,restaurant_name,order_number,payload)
  select
    v_batch_id,
    (item->>'row_number')::integer,
    nullif(item->>'record_date',''),
    nullif(item->>'store_code',''),
    nullif(item->>'restaurant_name',''),
    nullif(item->>'order_number',''),
    coalesce(item->'payload','{}'::jsonb)
  from jsonb_array_elements(p_rows) as t(item);
  return v_batch_id;
end;
$$;
revoke all on function public.t995_import_score_batch(date,text,text,jsonb) from public,anon;
grant execute on function public.t995_import_score_batch(date,text,text,jsonb) to authenticated;
