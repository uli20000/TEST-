alter policy t995_delay_orders_admin on public.t995_delay_orders to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy t995_line_records_admin on public.t995_line_signature_records to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
