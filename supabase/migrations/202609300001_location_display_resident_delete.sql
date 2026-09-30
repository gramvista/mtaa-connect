-- Expose an unambiguous geographic hierarchy and keep the legacy balozi_name
-- column (which historically represented the area name) for compatibility.
create or replace view public.resident_directory with(security_invoker=true) as
select r.*, coalesce(b.name,'') as balozi_name,m.name as mtaa_name,
 coalesce((select array_agg(rc.category_id) from public.resident_categories rc where rc.resident_id=r.id),'{}'::uuid[]) category_ids,
 coalesce((select string_agg(c.name,', ' order by c.name) from public.resident_categories rc join public.categories c on c.id=rc.category_id where rc.resident_id=r.id),'') category_names,
 (select max(s.expires_at) from public.subscriptions s where s.resident_id=r.id and s.status in ('active','expired')) expires_at,
 case when exists(select 1 from public.subscriptions s where s.resident_id=r.id and s.status='active' and s.starts_at<=now() and s.expires_at>now()) then 'active'
 when exists(select 1 from public.subscriptions s where s.resident_id=r.id and s.status in ('active','expired') and s.expires_at<=now()) then 'expired' else 'pending' end subscription_status,
 coalesce((select array_agg(rg.value_id) from public.resident_groups rg where rg.resident_id=r.id),'{}'::uuid[]) group_value_ids,
 coalesce((select string_agg(f.name||': '||v.name,', ' order by f.name) from public.resident_groups rg join public.grouping_values v on v.id=rg.value_id join public.grouping_fields f on f.id=rg.field_id where rg.resident_id=r.id),'') group_names,
 coalesce(b.name,'') as balozi_area_name,coalesce(b.balozi_name,'') as balozi_leader_name,
 w.name as ward_name,d.name as district_name,rg.name as region_name
from public.residents r
left join public.balozi_areas b on b.id=r.balozi_area_id
join public.mitaa m on m.id=r.mtaa_id
join public.wards w on w.id=m.ward_id
join public.districts d on d.id=w.district_id
join public.regions rg on rg.id=d.region_id;
grant select on public.resident_directory to authenticated,service_role;

-- This is intentionally a service-role-only operation. It removes the resident
-- and all dependent personal/payment/message records in one transaction while
-- retaining a non-PII audit event for accountability.
create function public.delete_resident_permanently(p_actor uuid,p_resident uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.residents; affected_campaign uuid;
begin
 perform private.require_actor(p_actor,null,true);
 select * into r from public.residents where id=p_resident for update;
 if r.id is null then raise exception 'Resident not found'; end if;

 delete from private.registration_sessions where resident_id=p_resident;
 delete from public.agent_commissions where resident_id=p_resident;
 delete from private.webhook_events e using public.payments p where e.payment_id=p.id and p.resident_id=p_resident;
 delete from public.payments where resident_id=p_resident;
 delete from public.subscriptions where resident_id=p_resident;

 for affected_campaign in select distinct campaign_id from public.sms_recipients where resident_id=p_resident loop
  delete from public.sms_recipients where campaign_id=affected_campaign and resident_id=p_resident;
  if exists(select 1 from public.sms_campaigns where id=affected_campaign and welcome_resident_id=p_resident) then
   delete from public.sms_campaigns where id=affected_campaign;
  else
   update public.sms_campaigns c set total_recipients=(select count(*) from public.sms_recipients s where s.campaign_id=c.id) where c.id=affected_campaign;
   perform private.refresh_campaign(affected_campaign);
  end if;
 end loop;
 delete from public.sms_campaigns where welcome_resident_id=p_resident;
 delete from public.resident_categories where resident_id=p_resident;
 delete from public.resident_groups where resident_id=p_resident;
 delete from public.residents where id=p_resident;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id)
 values(p_actor,'resident.deleted_permanently','resident',p_resident,r.mtaa_id);
end $$;

revoke all on function public.delete_resident_permanently(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_resident_permanently(uuid,uuid) to service_role;
