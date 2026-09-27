create table private.rate_limits(key text primary key, window_start timestamptz not null default now(), attempts integer not null default 1);
revoke all on private.rate_limits from public,anon,authenticated;
create function public.consume_rate_limit(p_key text,p_limit integer,p_window integer) returns boolean language plpgsql security definer set search_path='' as $$
declare current_attempts integer;
begin
 if p_limit not between 1 and 1000 or p_window not between 1 and 86400 or length(p_key)>200 then raise exception 'Invalid limit'; end if;
 insert into private.rate_limits(key) values(p_key) on conflict(key) do update
 set window_start=case when private.rate_limits.window_start<now()-make_interval(secs=>p_window) then now() else private.rate_limits.window_start end,
 attempts=case when private.rate_limits.window_start<now()-make_interval(secs=>p_window) then 1 else private.rate_limits.attempts+1 end returning attempts into current_attempts;
 return current_attempts<=p_limit;
end $$;
create function public.save_welcome_template(p_actor uuid,p_message text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_actor(p_actor,null,true);
 update public.sms_templates set message=p_message where name='welcome';
 insert into public.audit_logs(actor_id,action,entity_type) values(p_actor,'template.updated','sms_template');
end $$;
revoke all on function public.consume_rate_limit(text,integer,integer),public.save_welcome_template(uuid,text) from public,anon,authenticated;
grant execute on function public.consume_rate_limit(text,integer,integer),public.save_welcome_template(uuid,text) to service_role;
