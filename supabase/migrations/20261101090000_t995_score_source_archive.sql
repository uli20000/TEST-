-- Keep original ByDate and ByOrder Excel uploads in private Supabase Storage.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  't995-score-source-archive',
  't995-score-source-archive',
  false,
  52428800,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroEnabled.12'
  ]::text[]
)
on conflict(id) do update set
  name=excluded.name,
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.t995_score_source_archives (
  id text primary key,
  report_type text not null check (report_type in ('ByDate','ByOrder')),
  source_file text not null,
  storage_path text not null unique,
  file_size_bytes bigint not null check (file_size_bytes between 1 and 52428800),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  period_start date not null,
  period_end date not null,
  row_count integer not null check (row_count > 0),
  uploaded_by uuid not null references auth.users(id),
  uploaded_at timestamptz not null default now(),
  import_status text not null default 'archived'
    check (import_status in ('archived','imported','partial')),
  imported_at timestamptz,
  import_note text,
  check (period_end >= period_start),
  check (storage_path like '995/%')
);
create index if not exists t995_score_source_archives_period_idx
  on public.t995_score_source_archives(period_start,period_end,report_type);
create index if not exists t995_score_source_archives_uploaded_idx
  on public.t995_score_source_archives(uploaded_at desc);

alter table public.t995_score_source_archives enable row level security;
revoke all on public.t995_score_source_archives from anon,authenticated;
grant select,insert,update,delete on public.t995_score_source_archives to authenticated;
drop policy if exists t995_score_source_archives_admin on public.t995_score_source_archives;
create policy t995_score_source_archives_admin
  on public.t995_score_source_archives for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists t995_score_source_storage_admin_read on storage.objects;
create policy t995_score_source_storage_admin_read
  on storage.objects for select to authenticated
  using (bucket_id='t995-score-source-archive' and (select public.is_admin()));
drop policy if exists t995_score_source_storage_admin_insert on storage.objects;
create policy t995_score_source_storage_admin_insert
  on storage.objects for insert to authenticated
  with check (bucket_id='t995-score-source-archive' and (select public.is_admin()));
drop policy if exists t995_score_source_storage_admin_delete on storage.objects;
create policy t995_score_source_storage_admin_delete
  on storage.objects for delete to authenticated
  using (bucket_id='t995-score-source-archive' and (select public.is_admin()));