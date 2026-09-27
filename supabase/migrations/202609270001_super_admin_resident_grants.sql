-- Super Admin may grant a six-month resident subscription without collecting payment.
-- The grant is kept separate from successful payments so financial records remain truthful.
create function private.grant_resident_access(p_actor uuid,p_resident uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.residents; sid uuid; start_time timestamptz;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='super_admin' and status='active') then
  raise exception 'Forbidden';
 end if;
 select * into r from public.residents where id=p_resident for update;
 if r.id is null then raise exception 'Resident not found'; end if;
 select id into sid from public.subscriptions
 where resident_id=r.id and status='active' and starts_at<=now() and expires_at>now()
 order by expires_at desc limit 1;
 if sid is null then
  select greatest(now(),coalesce(max(expires_at),now())) into start_time
  from public.subscriptions where resident_id=r.id and status='active';
  insert into public.subscriptions(resident_id,mtaa_id,starts_at,expires_at)
  values(r.id,r.mtaa_id,start_time,(start_time at time zone 'Africa/Dar_es_Salaam' + interval '6 months') at time zone 'Africa/Dar_es_Salaam')
  returning id into sid;
 end if;
 update public.payments set status='cancelled'
 where resident_id=r.id and status='pending';
 update public.residents set registration_status='approved',approved_by=p_actor,
  approved_at=coalesce(approved_at,now()),status='active' where id=r.id;
 perform private.queue_welcome(r.id);
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id,metadata)
 values(p_actor,'resident.access_granted','resident',r.id,r.mtaa_id,jsonb_build_object('subscription_id',sid,'reason',p_reason));
 return sid;
end $$;

create function public.grant_resident_access(p_actor uuid,p_resident uuid)
returns uuid language sql security definer set search_path='' as $$
 select private.grant_resident_access(p_actor,p_resident,'manual_super_admin_approval')
$$;

create function private.grant_new_super_admin_resident() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.created_by is not null and exists(
  select 1 from public.profiles where id=new.created_by and role='super_admin' and status='active'
 ) then
  perform private.grant_resident_access(new.created_by,new.id,'created_by_super_admin');
 end if;
 return new;
end $$;

create trigger grant_new_super_admin_resident
after insert on public.residents for each row execute function private.grant_new_super_admin_resident();

revoke all on function public.grant_resident_access(uuid,uuid) from public,anon,authenticated;
grant execute on function public.grant_resident_access(uuid,uuid) to service_role;

