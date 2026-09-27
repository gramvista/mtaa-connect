-- Allow the trusted server to poll the latest ClickPesa attempt when a local
-- development URL cannot receive provider webhooks.
create function public.latest_payment_attempt(p_payment uuid,p_provider text)
returns text language plpgsql stable security definer set search_path='' as $$
declare result text;
begin
 if p_provider<>'clickpesa' then raise exception 'Payment attempt not found'; end if;
 select a.order_reference into result
 from private.payment_attempts a join public.payments p on p.id=a.payment_id
 where a.payment_id=p_payment and a.provider=p_provider and p.provider=p_provider
 order by a.attempt_number desc limit 1;
 return result;
end $$;

revoke all on function public.latest_payment_attempt(uuid,text) from public,anon,authenticated;
grant execute on function public.latest_payment_attempt(uuid,text) to service_role;
