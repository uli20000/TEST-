-- Keep one current import batch for each day and score report type.
with ranked_batches as (
  select id,
         row_number() over (
           partition by report_date, report_type
           order by imported_at desc, id desc
         ) as batch_rank
  from public.t995_score_import_batches
)
delete from public.t995_score_import_batches as batches
using ranked_batches
where batches.id = ranked_batches.id
  and ranked_batches.batch_rank > 1;

create unique index if not exists t995_score_import_batches_date_type_uidx
  on public.t995_score_import_batches(report_date, report_type);

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
  on conflict (report_date,report_type) do update
    set source_file=excluded.source_file,
        row_count=excluded.row_count,
        uploaded_by=excluded.uploaded_by,
        imported_at=now()
  returning id into v_batch_id;

  -- The current batch keeps its id; replace all its rows in this same transaction.
  delete from public.t995_score_import_rows where batch_id=v_batch_id;
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
