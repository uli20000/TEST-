-- Expose only restaurant TC history and area mapping to the existing admin account.
-- The protected employee/shift modules and their password checks remain enforced.
create or replace function public.t995_get_operations_reference(p_month date)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare first_day date; next_month date; prior_first date; prior_next date;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_month is null then raise exception 'Report month required'; end if;
  first_day:=date_trunc('month',p_month)::date;
  next_month:=(first_day+interval '1 month')::date;
  prior_first:=(first_day-interval '1 year')::date;
  prior_next:=(prior_first+interval '1 month')::date;
  return jsonb_build_object(
    'mapping',coalesce((select jsonb_agg(to_jsonb(a) order by a.area_code,a.restaurant_name) from
      (select restaurant_name,area_code from public.tc_restaurant_area_map where is_active) a),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.record_date,h.restaurant_name) from
      (select record_date,restaurant_name,area_code,prior_year_tc,total_tc,period_code
       from public.staffing_tc_history where period_code='full_day' and
       ((record_date>=first_day and record_date<next_month) or (record_date>=prior_first and record_date<prior_next))) h),'[]'::jsonb)
  );
end $$;
revoke all on function public.t995_get_operations_reference(date) from public,anon;
grant execute on function public.t995_get_operations_reference(date) to authenticated;
