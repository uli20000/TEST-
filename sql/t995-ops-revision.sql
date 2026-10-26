-- T995 daily operations follow-up migration
-- Run with: supabase db push --linked
alter table public.t995_line_signature_records
  add column if not exists line_completed boolean not null default false,
  add column if not exists signature_completed boolean not null default false;

update public.t995_line_signature_records
set line_completed = true, signature_completed = true
where status = 'completed' and line_completed = false and signature_completed = false;

create table if not exists public.t995_shared_reply_tokens (
  singleton boolean primary key default true check (singleton),
  token_hash text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.t995_shared_reply_tokens enable row level security;
revoke all on public.t995_shared_reply_tokens from anon, authenticated;

create or replace function public.t995_issue_shared_reply_link()
returns text language plpgsql security definer set search_path = public, extensions
as $$
declare v_token text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.t995_shared_reply_tokens(singleton,token_hash,active,updated_at)
  values(true,encode(extensions.digest(v_token,'sha256'),'hex'),true,now())
  on conflict(singleton) do update set token_hash=excluded.token_hash,active=true,updated_at=now();
  return v_token;
end $$;
revoke all on function public.t995_issue_shared_reply_link() from public, anon;
grant execute on function public.t995_issue_shared_reply_link() to authenticated;

create or replace function public.t995_public_list_shared_delay_orders(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions
as $$
declare v_month date := date_trunc('month', now() at time zone 'Asia/Taipei')::date;
begin
  if not exists(select 1 from public.t995_shared_reply_tokens
    where singleton and active and token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')) then
    raise exception 'Invalid or expired reply link';
  end if;
  return jsonb_build_object(
    'restaurant_name','所有餐廳','month',to_char(v_month,'YYYY-MM'),
    'orders',coalesce((select jsonb_agg(jsonb_build_object(
      'id',d.id,'record_date',d.record_date,'store_code',d.store_code,
      'restaurant_name',d.restaurant_name,'order_number',d.order_number
    ) order by d.record_date,d.store_code,d.order_number)
    from public.t995_delay_orders d where d.status='pending'
      and d.record_date>=v_month and d.record_date<(v_month+interval '1 month')::date),'[]'::jsonb)
  );
end $$;
revoke all on function public.t995_public_list_shared_delay_orders(text) from public;
grant execute on function public.t995_public_list_shared_delay_orders(text) to anon, authenticated;

create or replace function public.t995_public_submit_shared_delay_reasons(p_token text,p_updates jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions
as $$
declare v_month date := date_trunc('month', now() at time zone 'Asia/Taipei')::date; v_item jsonb;
begin
  if not exists(select 1 from public.t995_shared_reply_tokens
    where singleton and active and token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')) then
    raise exception 'Invalid or expired reply link';
  end if;
  if jsonb_typeof(p_updates)<>'array' then raise exception 'Updates must be an array'; end if;
  for v_item in select value from jsonb_array_elements(p_updates) loop
    if length(trim(coalesce(v_item->>'reason','')))>0 then
      update public.t995_delay_orders
      set reason=left(trim(v_item->>'reason'),500),status='completed',responded_at=now()
      where id=(v_item->>'id')::uuid and status='pending'
        and record_date>=v_month and record_date<(v_month+interval '1 month')::date;
    end if;
  end loop;
  return public.t995_public_list_shared_delay_orders(p_token);
end $$;
revoke all on function public.t995_public_submit_shared_delay_reasons(text,jsonb) from public;
grant execute on function public.t995_public_submit_shared_delay_reasons(text,jsonb) to anon, authenticated;

create table if not exists public.t995_score_labor_hours (
  record_date date not null,
  store_code text not null references public.t995_restaurants(store_code),
  total_hours numeric(8,2) not null default 0 check(total_hours>=0),
  transfer_out_hours numeric(8,2) not null default 0 check(transfer_out_hours>=0),
  transfer_in_hours numeric(8,2) not null default 0 check(transfer_in_hours>=0),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key(record_date,store_code)
);
alter table public.t995_score_labor_hours enable row level security;
drop policy if exists t995_score_labor_hours_auth_all on public.t995_score_labor_hours;
create policy t995_score_labor_hours_auth_all on public.t995_score_labor_hours
  for all to authenticated using(true) with check(true);
grant select,insert,update,delete on public.t995_score_labor_hours to authenticated;
