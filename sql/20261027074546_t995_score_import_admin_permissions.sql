-- Allow the overwrite RPC to update batch metadata and replace its rows.
-- Keep the write scope restricted to users in the administrator allowlist.
grant update (source_file, row_count, uploaded_by, imported_at)
  on table public.t995_score_import_batches to authenticated;
grant delete on table public.t995_score_import_rows to authenticated;

drop policy if exists t995_score_batches_authenticated
  on public.t995_score_import_batches;
create policy t995_score_batches_admin
  on public.t995_score_import_batches
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists t995_score_rows_authenticated
  on public.t995_score_import_rows;
create policy t995_score_rows_admin
  on public.t995_score_import_rows
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

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
  if not public.is_admin() then raise exception '僅限管理員匯入成績'; end if;
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
