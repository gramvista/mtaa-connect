-- The business allowance pays for the shared platform account only. A Mtaa
-- using its own verified Gramvista wallet is not limited by Mtaa Connect.
alter table public.sms_campaigns add column sms_account_mode text
 check(sms_account_mode is null or sms_account_mode in ('platform','own'));
update public.sms_campaigns c set sms_account_mode=coalesce(
 (select s.mode from public.mtaa_sms_settings s where s.mtaa_id=c.mtaa_id),'platform'
) where welcome_resident_id is null and confirmed_at is not null;

create or replace function public.mtaa_campaign_quota(p_actor uuid,p_mtaa uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.mtaa_campaign_quotas; used integer; account_mode text;
begin
 perform private.require_actor(p_actor,p_mtaa);
 insert into public.mtaa_campaign_quotas(mtaa_id) values(p_mtaa) on conflict do nothing;
 select * into q from public.mtaa_campaign_quotas where mtaa_id=p_mtaa;
 if q.period_ends_at<=now() then
  update public.mtaa_campaign_quotas set period_started_at=now(),period_ends_at=now()+interval '6 months',updated_at=now()
   where mtaa_id=p_mtaa returning * into q;
 end if;
 select coalesce((select mode from public.mtaa_sms_settings where mtaa_id=p_mtaa),'platform') into account_mode;
 select count(*) into used from public.sms_campaigns where mtaa_id=p_mtaa and welcome_resident_id is null
  and sms_account_mode='platform' and confirmed_at>=q.period_started_at and confirmed_at<q.period_ends_at;
 return jsonb_build_object('limit',q.campaign_limit,'used',used,'remaining',greatest(q.campaign_limit-used,0),
  'period_started_at',q.period_started_at,'period_ends_at',q.period_ends_at,'mode',account_mode,'applies',account_mode='platform');
end $$;

create or replace function public.confirm_campaign(p_actor uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.sms_campaigns; q public.mtaa_campaign_quotas; used integer; account_mode text;
begin
 select * into c from public.sms_campaigns where id=p_id for update;
 if c.id is null then raise exception 'Campaign not found'; end if;
 perform private.require_actor(p_actor,c.mtaa_id);
 if c.status<>'draft' then raise exception 'Campaign already confirmed'; end if;
 if c.total_recipients=0 then raise exception 'No eligible recipients'; end if;
 select coalesce((select mode from public.mtaa_sms_settings where mtaa_id=c.mtaa_id),'platform') into account_mode;
 if account_mode='platform' then
  insert into public.mtaa_campaign_quotas(mtaa_id) values(c.mtaa_id) on conflict do nothing;
  select * into q from public.mtaa_campaign_quotas where mtaa_id=c.mtaa_id for update;
  if q.period_ends_at<=now() then
   update public.mtaa_campaign_quotas set period_started_at=now(),period_ends_at=now()+interval '6 months',updated_at=now()
    where mtaa_id=c.mtaa_id returning * into q;
  end if;
  select count(*) into used from public.sms_campaigns where mtaa_id=c.mtaa_id and welcome_resident_id is null
   and sms_account_mode='platform' and confirmed_at>=q.period_started_at and confirmed_at<q.period_ends_at;
  if used>=q.campaign_limit then raise exception 'Mtaa campaign limit reached'; end if;
 end if;
 update public.sms_recipients s set status='cancelled' where campaign_id=c.id and not private.eligible(s.resident_id);
 update public.sms_campaigns set status='queued',confirmed_at=now(),sms_account_mode=account_mode where id=c.id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id,metadata)
 values(p_actor,'campaign.confirmed','campaign',c.id,c.mtaa_id,jsonb_build_object(
  'sms_account_mode',account_mode,'quota_used',case when account_mode='platform' then used+1 else null end,
  'quota_limit',case when account_mode='platform' then q.campaign_limit else null end));
end $$;
