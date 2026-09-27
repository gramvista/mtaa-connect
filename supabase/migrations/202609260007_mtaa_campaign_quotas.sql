-- Business allowance: each Mtaa receives 11 confirmed broadcast campaigns per
-- six-month period. Welcome messages and drafts do not consume the allowance.
create table public.mtaa_campaign_quotas (
 mtaa_id uuid primary key references public.mitaa on delete cascade,
 campaign_limit integer not null default 11 check(campaign_limit between 1 and 10000),
 period_started_at timestamptz not null default now(),
 period_ends_at timestamptz not null default (now()+interval '6 months'),
 updated_by uuid references public.profiles,
 updated_at timestamptz not null default now(),
 check(period_ends_at>period_started_at)
);
insert into public.mtaa_campaign_quotas(mtaa_id) select id from public.mitaa;
alter table public.mtaa_campaign_quotas enable row level security;
revoke all on public.mtaa_campaign_quotas from anon,authenticated;
grant select on public.mtaa_campaign_quotas to authenticated,service_role;
grant all on public.mtaa_campaign_quotas to service_role;
create policy tenant_campaign_quota_read on public.mtaa_campaign_quotas for select to authenticated using(private.is_mtaa_admin(mtaa_id));

create function public.mtaa_campaign_quota(p_actor uuid,p_mtaa uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.mtaa_campaign_quotas; used integer; actor_profile public.profiles;
begin
 actor_profile:=private.require_actor(p_actor,p_mtaa);
 insert into public.mtaa_campaign_quotas(mtaa_id) values(p_mtaa) on conflict do nothing;
 select * into q from public.mtaa_campaign_quotas where mtaa_id=p_mtaa;
 if q.period_ends_at<=now() then
  update public.mtaa_campaign_quotas set period_started_at=now(),period_ends_at=now()+interval '6 months',updated_at=now()
   where mtaa_id=p_mtaa returning * into q;
 end if;
 select count(*) into used from public.sms_campaigns where mtaa_id=p_mtaa and welcome_resident_id is null
  and confirmed_at>=q.period_started_at and confirmed_at<q.period_ends_at;
 return jsonb_build_object('limit',q.campaign_limit,'used',used,'remaining',greatest(q.campaign_limit-used,0),
  'period_started_at',q.period_started_at,'period_ends_at',q.period_ends_at);
end $$;

create function public.set_mtaa_campaign_limit(p_actor uuid,p_mtaa uuid,p_limit integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_actor(p_actor,null,true);
 if p_limit not between 1 and 10000 or not exists(select 1 from public.mitaa where id=p_mtaa) then raise exception 'Invalid campaign limit'; end if;
 insert into public.mtaa_campaign_quotas(mtaa_id,campaign_limit,updated_by) values(p_mtaa,p_limit,p_actor)
 on conflict(mtaa_id) do update set campaign_limit=excluded.campaign_limit,updated_by=p_actor,updated_at=now();
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id,metadata)
 values(p_actor,'campaign.limit_updated','mtaa',p_mtaa,p_mtaa,jsonb_build_object('campaign_limit',p_limit));
end $$;

create or replace function public.confirm_campaign(p_actor uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.sms_campaigns; q public.mtaa_campaign_quotas; used integer;
begin
 select * into c from public.sms_campaigns where id=p_id for update;
 if c.id is null then raise exception 'Campaign not found'; end if;
 perform private.require_actor(p_actor,c.mtaa_id);
 if c.status<>'draft' then raise exception 'Campaign already confirmed'; end if;
 if c.total_recipients=0 then raise exception 'No eligible recipients'; end if;
 insert into public.mtaa_campaign_quotas(mtaa_id) values(c.mtaa_id) on conflict do nothing;
 select * into q from public.mtaa_campaign_quotas where mtaa_id=c.mtaa_id for update;
 if q.period_ends_at<=now() then
  update public.mtaa_campaign_quotas set period_started_at=now(),period_ends_at=now()+interval '6 months',updated_at=now()
   where mtaa_id=c.mtaa_id returning * into q;
 end if;
 select count(*) into used from public.sms_campaigns where mtaa_id=c.mtaa_id and welcome_resident_id is null
  and confirmed_at>=q.period_started_at and confirmed_at<q.period_ends_at;
 if used>=q.campaign_limit then raise exception 'Mtaa campaign limit reached'; end if;
 update public.sms_recipients s set status='cancelled' where campaign_id=c.id and not private.eligible(s.resident_id);
 update public.sms_campaigns set status='queued',confirmed_at=now() where id=c.id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id,metadata)
 values(p_actor,'campaign.confirmed','campaign',c.id,c.mtaa_id,jsonb_build_object('quota_used',used+1,'quota_limit',q.campaign_limit));
end $$;

revoke all on function public.mtaa_campaign_quota(uuid,uuid),public.set_mtaa_campaign_limit(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.mtaa_campaign_quota(uuid,uuid),public.set_mtaa_campaign_limit(uuid,uuid,integer) to service_role;
