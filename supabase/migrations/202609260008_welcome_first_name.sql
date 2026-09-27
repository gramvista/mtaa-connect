-- Personalize the one-time welcome message after both payment and Mtaa
-- approval are complete. Only the resident's first name is included.
update public.sms_templates
set message='Habari {{name}} wa mtaa {{mtaa}}, karibu Mtaa Connect. Usajili wako umekamilika.'
where name='welcome';

create or replace function private.queue_welcome(rid uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.residents; cid uuid; body text;
begin
 if not private.eligible(rid) then return; end if;
 select * into r from public.residents where id=rid;
 select replace(replace(t.message,'{{name}}',split_part(trim(r.full_name),' ',1)),'{{mtaa}}',m.name)
 into body from public.sms_templates t cross join public.mitaa m where t.name='welcome' and m.id=r.mtaa_id;
 insert into public.sms_campaigns(mtaa_id,title,message,target_type,status,total_recipients,welcome_resident_id,confirmed_at,units_per_message)
 values(r.mtaa_id,'Karibu Mtaa Connect',body,'welcome','queued',1,rid,now(),private.sms_units(body))
 on conflict(welcome_resident_id) do nothing returning id into cid;
 if cid is not null then
  insert into public.sms_recipients(campaign_id,resident_id,mtaa_id,phone_number_snapshot)
  values(cid,rid,r.mtaa_id,r.phone_number);
 end if;
end $$;
