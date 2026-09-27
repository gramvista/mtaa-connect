-- Service-only, serialized first administrator provisioning. No public signup trigger.
create function public.bootstrap_super_admin(p_user uuid,p_name text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(927416001);
 if exists(select 1 from public.profiles where role='super_admin') then raise exception 'Super administrator already exists'; end if;
 insert into public.profiles(id,full_name,role) values(p_user,trim(p_name),'super_admin');
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(p_user,'platform.bootstrapped','profile',p_user);
end $$;
revoke all on function public.bootstrap_super_admin(uuid,text) from public,anon,authenticated;
grant execute on function public.bootstrap_super_admin(uuid,text) to service_role;
