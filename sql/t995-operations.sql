-- T995 營運管理資料庫增量。Supabase Dashboard > SQL Editor 執行一次。
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.t995_restaurants (
  store_code text primary key,
  restaurant_name text not null,
  enabled boolean not null default true
);
insert into public.t995_restaurants(store_code,restaurant_name) values
('093','林口文化'),
('018','林口復興'),
('099','南崁中正'),
('201','桃園台茂'),
('095','中壢環中東'),
('209','中壢環中東二'),
('137','桃園大園'),
('062','龍潭北龍'),
('154','新竹清大'),
('227','桃園新屋'),
('248','桃園領航'),
('041','楊梅中山'),
('161','楊梅大成'),
('516','中壢中正'),
('544','中壢中和'),
('084','中壢民族'),
('242','中壢過嶺'),
('580','苗栗頭份'),
('133','新竹新豐'),
('203','新竹湖口'),
('562','新竹竹北'),
('144','竹北自強'),
('587','新竹民生'),
('066','新竹竹東'),
('214','新竹中正'),
('594','新竹亞太'),
('235','竹北中華'),
('025','苗栗中正'),
('173','苗栗竹南'),
('142','桃園桃營'),
('182','桃園萬壽'),
('167','桃園介壽'),
('165','桃園南平'),
('179','桃園大竹'),
('190','桃園大溪'),
('098','桃園大興西'),
('183','桃園中山二'),
('013','新竹光復')
on conflict(store_code) do update set restaurant_name=excluded.restaurant_name;

create table if not exists public.t995_delay_orders (
  id uuid primary key default gen_random_uuid(),
  record_date date not null,
  store_code text not null references public.t995_restaurants(store_code),
  restaurant_name text not null,
  order_number text not null,
  status text not null default 'pending' check(status in ('pending','completed')),
  reason text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique(record_date,store_code,order_number)
);
create index if not exists t995_delay_orders_month_store_idx on public.t995_delay_orders(store_code,record_date,status);

create table if not exists public.t995_line_signature_records (
  id uuid primary key default gen_random_uuid(),
  record_date date not null,
  store_code text not null references public.t995_restaurants(store_code),
  restaurant_name text not null,
  status text not null default 'completed' check(status in ('completed','not_completed')),
  signer_name text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(record_date,store_code)
);

create table if not exists public.t995_restaurant_reply_tokens (
  store_code text primary key references public.t995_restaurants(store_code),
  token_hash text not null unique,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.t995_restaurants enable row level security;
alter table public.t995_delay_orders enable row level security;
alter table public.t995_line_signature_records enable row level security;
alter table public.t995_restaurant_reply_tokens enable row level security;
revoke all on public.t995_restaurants,public.t995_delay_orders,public.t995_line_signature_records,public.t995_restaurant_reply_tokens from anon,authenticated;
grant select on public.t995_restaurants to authenticated;
grant select,insert,update on public.t995_delay_orders to authenticated;
grant select,insert,update on public.t995_line_signature_records to authenticated;
drop policy if exists t995_restaurants_admin on public.t995_restaurants;
create policy t995_restaurants_admin on public.t995_restaurants for select to authenticated using(auth.uid() is not null);
drop policy if exists t995_delay_orders_admin on public.t995_delay_orders;
create policy t995_delay_orders_admin on public.t995_delay_orders for all to authenticated using(auth.uid() is not null) with check(auth.uid() is not null);
drop policy if exists t995_line_records_admin on public.t995_line_signature_records;
create policy t995_line_records_admin on public.t995_line_signature_records for all to authenticated using(auth.uid() is not null) with check(auth.uid() is not null);

create or replace function public.t995_issue_restaurant_reply_link(p_store_code text)
returns text language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_token text; v_name text;
begin
  if auth.uid() is null then raise exception '管理員登入後才能產生餐廳連結'; end if;
  select restaurant_name into v_name from public.t995_restaurants where store_code=trim(p_store_code) and enabled;
  if v_name is null then raise exception '找不到有效餐廳店號'; end if;
  v_token:=encode(gen_random_bytes(32),'hex');
  insert into public.t995_restaurant_reply_tokens(store_code,token_hash,active,updated_at)
  values(trim(p_store_code),encode(digest(v_token,'sha256'),'hex'),true,now())
  on conflict(store_code) do update set token_hash=excluded.token_hash,active=true,updated_at=now();
  return v_token;
end $$;

create or replace function public.t995_public_list_delay_orders(p_token text)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_store text; v_name text; v_start date; v_orders jsonb;
begin
  select t.store_code,r.restaurant_name into v_store,v_name
  from public.t995_restaurant_reply_tokens t join public.t995_restaurants r using(store_code)
  where t.active and t.token_hash=encode(digest(coalesce(p_token,''),'sha256'),'hex') and r.enabled;
  if v_store is null then raise exception '連結無效或已重設，請聯絡值班人員'; end if;
  v_start:=date_trunc('month',now() at time zone 'Asia/Taipei')::date;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'record_date',record_date,'order_number',order_number) order by record_date,created_at),'[]'::jsonb)
  into v_orders from public.t995_delay_orders
  where store_code=v_store and status='pending' and record_date>=v_start and record_date<(v_start+interval '1 month')::date;
  return jsonb_build_object('store_code',v_store,'restaurant_name',v_name,'month',to_char(v_start,'YYYY-MM'),'orders',v_orders);
end $$;

create or replace function public.t995_public_submit_delay_reasons(p_token text,p_updates jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_store text; v_item jsonb; v_reason text; v_id uuid; v_start date; v_count integer;
begin
  select store_code into v_store from public.t995_restaurant_reply_tokens
  where active and token_hash=encode(digest(coalesce(p_token,''),'sha256'),'hex');
  if v_store is null then raise exception '連結無效或已重設，請聯絡值班人員'; end if;
  if jsonb_typeof(p_updates)<>'array' then raise exception '回覆資料格式錯誤'; end if;
  v_start:=date_trunc('month',now() at time zone 'Asia/Taipei')::date;
  for v_item in select value from jsonb_array_elements(p_updates) loop
    v_id:=(v_item->>'id')::uuid; v_reason:=nullif(trim(v_item->>'reason'),'');
    if v_reason is null then raise exception '每筆回覆都需要填寫原因'; end if;
    update public.t995_delay_orders set reason=v_reason,status='completed',responded_at=now()
    where id=v_id and store_code=v_store and status='pending'
      and record_date>=v_start and record_date<(v_start+interval '1 month')::date;
    get diagnostics v_count=row_count;
    if v_count<>1 then raise exception '有訂單已回覆或不屬於本月，請重新整理後再試'; end if;
  end loop;
  return public.t995_public_list_delay_orders(p_token);
end $$;

revoke all on function public.t995_issue_restaurant_reply_link(text) from public,anon;
grant execute on function public.t995_issue_restaurant_reply_link(text) to authenticated;
revoke all on function public.t995_public_list_delay_orders(text) from public;
grant execute on function public.t995_public_list_delay_orders(text) to anon,authenticated;
revoke all on function public.t995_public_submit_delay_reasons(text,jsonb) from public;
grant execute on function public.t995_public_submit_delay_reasons(text,jsonb) to anon,authenticated;
