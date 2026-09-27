-- Each Mtaa may use the platform Gramvista account or its own supported
-- provider account. Secrets remain in the private schema as app-encrypted text.
create table public.mtaa_sms_settings (
 mtaa_id uuid primary key references public.mitaa on delete cascade,
 mode text not null default 'platform' check(mode in ('platform','own')),
 provider text not null default 'gramvista' check(provider in ('gramvista')),
 sender_id text check(sender_id is null or sender_id ~ '^[A-Za-z0-9 ]{1,11}$'),
 status text not null default 'active' check(status in ('active','disabled')),
 updated_by uuid not null references public.profiles,
 updated_at timestamptz not null default now()
);
create table private.mtaa_sms_credentials (
 mtaa_id uuid primary key references public.mitaa on delete cascade,
 encrypted_api_key text not null,
 encrypted_webhook_secret text,
 updated_at timestamptz not null default now()
);
alter table public.mtaa_sms_settings enable row level security;
revoke all on public.mtaa_sms_settings from anon,authenticated;
grant select on public.mtaa_sms_settings to authenticated,service_role;
grant all on public.mtaa_sms_settings to service_role;
revoke all on private.mtaa_sms_credentials from public,anon,authenticated;
create policy tenant_sms_settings_read on public.mtaa_sms_settings for select to authenticated using(
 exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='active'
 and (p.role='super_admin' or (p.role='mtaa_admin' and p.mtaa_id=mtaa_sms_settings.mtaa_id)))
);

create function public.save_mtaa_sms_configuration(p_actor uuid,p_mtaa uuid,p_mode text,p_provider text,p_sender text,p_encrypted_key text default null,p_encrypted_webhook text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_actor(p_actor,p_mtaa);
 if p_mode not in ('platform','own') or p_provider<>'gramvista' then raise exception 'Invalid SMS configuration'; end if;
 if p_mode='own' and (p_sender is null or p_sender !~ '^[A-Za-z0-9 ]{1,11}$') then raise exception 'Invalid Sender ID'; end if;
 if p_mode='own' and p_encrypted_key is null and not exists(select 1 from private.mtaa_sms_credentials where mtaa_id=p_mtaa) then raise exception 'API key required'; end if;
 insert into public.mtaa_sms_settings(mtaa_id,mode,provider,sender_id,updated_by)
 values(p_mtaa,p_mode,p_provider,case when p_mode='own' then p_sender else null end,p_actor)
 on conflict(mtaa_id) do update set mode=excluded.mode,provider=excluded.provider,sender_id=excluded.sender_id,updated_by=excluded.updated_by,updated_at=now();
 if p_mode='platform' then delete from private.mtaa_sms_credentials where mtaa_id=p_mtaa;
 elsif p_encrypted_key is not null then
  insert into private.mtaa_sms_credentials(mtaa_id,encrypted_api_key,encrypted_webhook_secret)
  values(p_mtaa,p_encrypted_key,p_encrypted_webhook)
  on conflict(mtaa_id) do update set encrypted_api_key=excluded.encrypted_api_key,
   encrypted_webhook_secret=coalesce(excluded.encrypted_webhook_secret,private.mtaa_sms_credentials.encrypted_webhook_secret),updated_at=now();
 elsif p_encrypted_webhook is not null then
  update private.mtaa_sms_credentials set encrypted_webhook_secret=p_encrypted_webhook,updated_at=now() where mtaa_id=p_mtaa;
 end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id,metadata)
 values(p_actor,'sms.configuration_updated','mtaa',p_mtaa,p_mtaa,jsonb_build_object('mode',p_mode,'provider',p_provider,'sender_id',case when p_mode='own' then p_sender else null end));
end $$;

create function public.mtaa_sms_configuration(p_mtaa uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when s.mtaa_id is null then null else jsonb_build_object(
  'mode',s.mode,'provider',s.provider,'sender_id',s.sender_id,'status',s.status,
  'encrypted_api_key',c.encrypted_api_key,'encrypted_webhook_secret',c.encrypted_webhook_secret
 ) end
 from (select p_mtaa id) x left join public.mtaa_sms_settings s on s.mtaa_id=x.id
 left join private.mtaa_sms_credentials c on c.mtaa_id=s.mtaa_id
$$;

drop function public.claim_sms(integer);
create function public.claim_sms(p_limit integer default 50) returns table(id uuid,phone text,message text,mtaa_id uuid) language plpgsql security definer set search_path='' as $$
begin
 if p_limit not between 1 and 100 then raise exception 'Invalid batch size'; end if;
 update public.sms_recipients set status='uncertain',error_message='Worker lease expired; reconcile with provider before retry' where status='processing' and claimed_at<now()-interval '10 minutes';
 update public.sms_recipients s set status='cancelled' where status='pending' and not private.eligible(s.resident_id)
 and exists(select 1 from public.sms_campaigns c where c.id=s.campaign_id and c.status in ('queued','processing'));
 return query with picked as (
  select s.id from public.sms_recipients s join public.sms_campaigns c on c.id=s.campaign_id
  where s.status='pending' and c.status in ('queued','processing') and private.eligible(s.resident_id)
  order by c.created_at,s.id for update of s skip locked limit p_limit
 ), claimed as (
  update public.sms_recipients s set status='processing',claimed_at=now(),attempts=attempts+1 from picked where s.id=picked.id
  returning s.id,s.phone_number_snapshot,s.campaign_id,s.mtaa_id
 ) select claimed.id,claimed.phone_number_snapshot,c.message,claimed.mtaa_id from claimed join public.sms_campaigns c on c.id=claimed.campaign_id;
end $$;

revoke all on function public.save_mtaa_sms_configuration(uuid,uuid,text,text,text,text,text),public.mtaa_sms_configuration(uuid),public.claim_sms(integer) from public,anon,authenticated;
grant execute on function public.save_mtaa_sms_configuration(uuid,uuid,text,text,text,text,text),public.mtaa_sms_configuration(uuid),public.claim_sms(integer) to service_role;
