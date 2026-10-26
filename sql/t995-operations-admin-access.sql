-- Keep operational reports limited to the existing administrator allowlist.
drop policy if exists t995_operations_reports_read on public.t995_operations_daily_reports;
drop policy if exists t995_operations_reports_admin on public.t995_operations_daily_reports;
create policy t995_operations_reports_admin on public.t995_operations_daily_reports
  for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));
grant select,insert,update on public.t995_operations_daily_reports to authenticated;
alter function public.t995_save_operations_report(date,text,numeric,numeric,numeric,text) security invoker;

-- Only the narrow admin-only reference helper needs access to the protected TC tables.
-- Keep that privileged implementation outside the exposed API schema.
create schema if not exists t995_private;
revoke all on schema t995_private from public,anon;
grant usage on schema t995_private to authenticated;
do $$
begin
  if to_regprocedure('t995_private.t995_get_operations_reference(date)') is null then
    alter function public.t995_get_operations_reference(date) set schema t995_private;
  end if;
end $$;
revoke all on function t995_private.t995_get_operations_reference(date) from public,anon;
grant execute on function t995_private.t995_get_operations_reference(date) to authenticated;
create or replace function public.t995_get_operations_reference(p_month date)
returns jsonb language sql stable security invoker set search_path=''
as $$select t995_private.t995_get_operations_reference(p_month)$$;
revoke all on function public.t995_get_operations_reference(date) from public,anon;
grant execute on function public.t995_get_operations_reference(date) to authenticated;
