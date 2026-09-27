create table public.subscriptions (
 id uuid primary key default gen_random_uuid(), resident_id uuid not null, mtaa_id uuid not null references public.mitaa,
 amount integer not null default 3000 check(amount=3000), currency text not null default 'TZS' check(currency='TZS'),
 starts_at timestamptz not null, expires_at timestamptz not null,
 status text not null default 'active' check(status in ('pending','active','expired','cancelled')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(resident_id,mtaa_id) references public.residents(id,mtaa_id), check(expires_at>starts_at), unique(id,resident_id)
);
create index subscriptions_eligibility on public.subscriptions(resident_id,status,expires_at);
create index subscriptions_tenant on public.subscriptions(mtaa_id,status,expires_at);
create table public.payments (
 id uuid primary key default gen_random_uuid(), resident_id uuid not null, mtaa_id uuid not null references public.mitaa,
 subscription_id uuid, provider text not null, provider_reference text,
 idempotency_key uuid not null unique, amount integer not null default 3000 check(amount=3000),
 currency text not null default 'TZS' check(currency='TZS'), status text not null default 'pending' check(status in ('pending','successful','failed','cancelled')),
 paid_at timestamptz, created_at timestamptz not null default now(),
 foreign key(resident_id,mtaa_id) references public.residents(id,mtaa_id),
 foreign key(subscription_id,resident_id) references public.subscriptions(id,resident_id), unique(provider,provider_reference)
);
create index payments_resident on public.payments(resident_id,created_at desc);
create index payments_tenant on public.payments(mtaa_id,created_at desc);
create index payments_subscription on public.payments(subscription_id);
create table public.sms_templates (
 name text primary key, message text not null check(length(message) between 1 and 1000)
);
insert into public.sms_templates values('welcome','Karibu Mtaa Connect. Usajili wako katika {{mtaa}} umekamilika. Sasa utapokea taarifa muhimu kutoka kwa uongozi wa mtaa wako.');
create table public.sms_campaigns (
 id uuid primary key default gen_random_uuid(), mtaa_id uuid not null references public.mitaa, created_by uuid references public.profiles,
 title text not null check(length(trim(title)) between 2 and 120), message text not null check(length(trim(message)) between 1 and 1000),
 target_type text not null check(target_type in ('all','balozi','category','balozi_category','selected','welcome')),
 target jsonb not null default '{}', status text not null default 'draft' check(status in ('draft','queued','processing','completed','partially_failed','failed','cancelled')),
 total_recipients integer not null default 0, sent_count integer not null default 0, delivered_count integer not null default 0, failed_count integer not null default 0,
 units_per_message integer not null default 1 check(units_per_message between 1 and 20), welcome_resident_id uuid unique references public.residents,
 created_at timestamptz not null default now(), sent_at timestamptz, confirmed_at timestamptz, unique(id,mtaa_id)
);
create index campaigns_tenant_date on public.sms_campaigns(mtaa_id,created_at desc);
create index campaigns_status on public.sms_campaigns(status,created_at);
create index campaigns_creator on public.sms_campaigns(created_by);
create table public.sms_recipients (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null, resident_id uuid not null,mtaa_id uuid not null,
 phone_number_snapshot text not null, provider_message_id text, provider text,
 status text not null default 'pending' check(status in ('pending','processing','sent','delivered','failed','uncertain','cancelled')),
 attempts integer not null default 0, claimed_at timestamptz, sent_at timestamptz,delivered_at timestamptz,error_message text,
 foreign key(campaign_id,mtaa_id) references public.sms_campaigns(id,mtaa_id),
 foreign key(resident_id,mtaa_id) references public.residents(id,mtaa_id), unique(campaign_id,resident_id),unique(provider,provider_message_id)
);
create index sms_recipient_queue on public.sms_recipients(status,claimed_at);
create index sms_recipient_tenant on public.sms_recipients(mtaa_id,campaign_id);
create index sms_recipient_resident on public.sms_recipients(resident_id);
create table private.webhook_events (
 provider text not null,event_id text not null, payment_id uuid references public.payments,created_at timestamptz not null default now(), primary key(provider,event_id)
);
revoke all on private.webhook_events from public,anon,authenticated;

do $$ declare t text; begin
 foreach t in array array['subscriptions','payments','sms_templates','sms_campaigns','sms_recipients'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 if t<>'sms_templates' then execute format('create policy tenant_read on public.%I for select to authenticated using(private.is_mtaa_admin(mtaa_id))',t); end if;
 end loop;
end $$;
create policy template_read on public.sms_templates for select to authenticated using(private.is_active_admin());

create function private.eligible(rid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.residents r join public.mitaa m on m.id=r.mtaa_id join public.balozi_areas b on b.id=r.balozi_area_id
 where r.id=rid and r.status='active' and r.registration_status='approved' and m.status='active' and b.status='active'
 and exists(select 1 from public.subscriptions s where s.resident_id=r.id and s.status='active' and s.starts_at<=now() and s.expires_at>now()))
$$;

create function private.sms_units(body text) returns integer language plpgsql immutable set search_path='' as $$
declare ch text; gsm_length integer=0; unicode_length integer=0; unicode_message boolean=false; i integer;
begin
 for i in 1..length(body) loop
  ch=substr(body,i,1);
  unicode_length=unicode_length+case when ascii(ch)>65535 then 2 else 1 end;
  if position(ch in E'@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&''()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà')>0 then gsm_length=gsm_length+1;
  elsif position(ch in E'^{}\\[~]|€\f')>0 then gsm_length=gsm_length+2;
  else unicode_message=true; end if;
 end loop;
 if unicode_message then return case when unicode_length<=70 then 1 else ceil(unicode_length/67.0)::integer end; end if;
 return case when gsm_length<=160 then 1 else ceil(gsm_length/153.0)::integer end;
end $$;

create function private.queue_welcome(rid uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.residents; cid uuid; body text;
begin
 if not private.eligible(rid) then return; end if;
 select * into r from public.residents where id=rid;
 select replace(t.message,'{{mtaa}}',m.name) into body from public.sms_templates t cross join public.mitaa m where t.name='welcome' and m.id=r.mtaa_id;
 insert into public.sms_campaigns(mtaa_id,title,message,target_type,status,total_recipients,welcome_resident_id,confirmed_at,units_per_message)
 values(r.mtaa_id,'Karibu Mtaa Connect',body,'welcome','queued',1,rid,now(),private.sms_units(body)) on conflict(welcome_resident_id) do nothing returning id into cid;
 if cid is not null then insert into public.sms_recipients(campaign_id,resident_id,mtaa_id,phone_number_snapshot) values(cid,rid,r.mtaa_id,r.phone_number); end if;
end $$;
create function private.after_resident_approved() returns trigger language plpgsql security definer set search_path='' as $$
begin if new.registration_status='approved' and new.status='active' then perform private.queue_welcome(new.id); end if; return new; end $$;
create trigger welcome_after_approval after update on public.residents for each row execute function private.after_resident_approved();

create function public.create_payment(p_actor uuid,p_resident uuid,p_provider text,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare tenant uuid; pid uuid; old_payment public.payments;
begin
 select mtaa_id into tenant from public.residents where id=p_resident;
 if tenant is null then raise exception 'Resident not found'; end if;
 perform private.require_actor(p_actor,tenant);
 if p_provider not in ('mock','pending') then raise exception 'Provider not implemented'; end if;
 insert into public.payments(resident_id,mtaa_id,provider,idempotency_key) values(p_resident,tenant,p_provider,p_key)
 on conflict(idempotency_key) do nothing returning id into pid;
 if pid is null then
 select * into old_payment from public.payments where idempotency_key=p_key;
 if old_payment.resident_id<>p_resident or old_payment.provider<>p_provider then raise exception 'Idempotency key conflict'; end if;
 return old_payment.id;
 end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id) values(p_actor,'payment.created','payment',pid,tenant);
 return pid;
end $$;

-- Call ONLY after a provider adapter has cryptographically verified the callback.
create function public.settle_payment(p_payment uuid,p_provider text,p_reference text,p_event text,p_amount integer,p_currency text)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.payments; sid uuid; start_time timestamptz; event_payment uuid;
begin
 select * into p from public.payments where id=p_payment for update;
 if p.id is null or p.provider<>p_provider or p_amount<>3000 or p_currency<>'TZS' or length(p_reference)<1 or length(p_event)<1 then raise exception 'Invalid verified payment'; end if;
 insert into private.webhook_events(provider,event_id,payment_id) values(p_provider,p_event,p_payment) on conflict do nothing;
 select payment_id into event_payment from private.webhook_events where provider=p_provider and event_id=p_event;
 if event_payment<>p_payment then raise exception 'Event conflict'; end if;
 if p.status='successful' then
  if p.provider_reference<>p_reference then raise exception 'Reference conflict'; end if;
  return p.subscription_id;
 end if;
 if p.status<>'pending' then raise exception 'Payment is not pending'; end if;
 -- Serialize simultaneous renewals of one resident across different payments.
 perform 1 from public.residents where id=p.resident_id for update;
 select greatest(now(),coalesce(max(expires_at),now())) into start_time from public.subscriptions where resident_id=p.resident_id and status='active';
 insert into public.subscriptions(resident_id,mtaa_id,starts_at,expires_at) values(p.resident_id,p.mtaa_id,start_time,(start_time at time zone 'Africa/Dar_es_Salaam' + interval '6 months') at time zone 'Africa/Dar_es_Salaam') returning id into sid;
 update public.payments set status='successful',provider_reference=p_reference,subscription_id=sid,paid_at=now() where id=p.id;
 perform private.queue_welcome(p.resident_id);
 insert into public.audit_logs(action,entity_type,entity_id,mtaa_id,metadata) values('payment.verified','payment',p.id,p.mtaa_id,jsonb_build_object('subscription_id',sid,'provider',p_provider));
 return sid;
end $$;

create function public.preview_campaign(p_actor uuid,p_mtaa uuid,p_title text,p_message text,p_type text,p_balozi uuid,p_category uuid,p_selected uuid[],p_units integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 perform private.require_actor(p_actor,p_mtaa);
 if p_type not in ('all','balozi','category','balozi_category','selected') then raise exception 'Invalid target'; end if;
 if p_type in ('balozi','balozi_category') and not exists(select 1 from public.balozi_areas where id=p_balozi and mtaa_id=p_mtaa and status='active') then raise exception 'Invalid Balozi'; end if;
 if p_type in ('category','balozi_category') and not exists(select 1 from public.categories where id=p_category and (mtaa_id is null or mtaa_id=p_mtaa) and status='active') then raise exception 'Invalid category'; end if;
 if p_type='selected' and (coalesce(cardinality(p_selected),0) not between 1 and 500 or exists(select 1 from unnest(p_selected) x where not exists(select 1 from public.residents where id=x and mtaa_id=p_mtaa))) then raise exception 'Invalid selected residents'; end if;
 insert into public.sms_campaigns(mtaa_id,created_by,title,message,target_type,target,units_per_message)
 values(p_mtaa,p_actor,trim(p_title),trim(p_message),p_type,jsonb_build_object('balozi',p_balozi,'category',p_category),p_units) returning id into cid;
 insert into public.sms_recipients(campaign_id,resident_id,mtaa_id,phone_number_snapshot)
 select cid,r.id,r.mtaa_id,r.phone_number from public.residents r
 where r.mtaa_id=p_mtaa and private.eligible(r.id)
 and (p_type not in ('balozi','balozi_category') or r.balozi_area_id=p_balozi)
 and (p_type not in ('category','balozi_category') or exists(select 1 from public.resident_categories rc where rc.resident_id=r.id and rc.category_id=p_category))
 and (p_type<>'selected' or r.id=any(p_selected));
 update public.sms_campaigns set total_recipients=(select count(*) from public.sms_recipients where campaign_id=cid) where id=cid;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id) values(p_actor,'campaign.preview','campaign',cid,p_mtaa);
 return cid;
end $$;
create function public.confirm_campaign(p_actor uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.sms_campaigns;
begin
 select * into c from public.sms_campaigns where id=p_id for update;
 if c.id is null then raise exception 'Campaign not found'; end if;
 perform private.require_actor(p_actor,c.mtaa_id);
 if c.status<>'draft' then raise exception 'Campaign already confirmed'; end if;
 if c.total_recipients=0 then raise exception 'No eligible recipients'; end if;
 update public.sms_recipients s set status='cancelled' where campaign_id=c.id and not private.eligible(s.resident_id);
 update public.sms_campaigns set status='queued',confirmed_at=now() where id=c.id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id) values(p_actor,'campaign.confirmed','campaign',c.id,c.mtaa_id);
end $$;

create function private.refresh_campaign(cid uuid) returns void language plpgsql security definer set search_path='' as $$
declare waiting integer; errors integer; sent integer; delivered integer;
begin
 select count(*) filter(where status in ('pending','processing')),count(*) filter(where status in ('failed','uncertain')),
 count(*) filter(where status in ('sent','delivered')),count(*) filter(where status='delivered')
 into waiting,errors,sent,delivered from public.sms_recipients where campaign_id=cid;
 update public.sms_campaigns set sent_count=sent,delivered_count=delivered,failed_count=errors,
 status=case when waiting>0 then 'processing' when errors>0 and sent>0 then 'partially_failed' when errors>0 then 'failed' else 'completed' end,
 sent_at=case when waiting=0 then coalesce(sent_at,now()) else sent_at end where id=cid and status<>'draft';
end $$;

-- Claimed rows are never automatically resent. A crashed/ambiguous send is uncertain.
create function public.claim_sms(p_limit integer default 50) returns table(id uuid,phone text,message text) language plpgsql security definer set search_path='' as $$
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
 update public.sms_recipients s set status='processing',claimed_at=now(),attempts=attempts+1 from picked where s.id=picked.id returning s.id,s.phone_number_snapshot,s.campaign_id
 ) select claimed.id,claimed.phone_number_snapshot,c.message from claimed join public.sms_campaigns c on c.id=claimed.campaign_id;
end $$;

create function public.record_sms_result(p_id uuid,p_provider text,p_provider_id text,p_status text,p_error text default null) returns void language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 if p_status not in ('sent','failed','uncertain') then raise exception 'Invalid outcome'; end if;
 if p_status='sent' and coalesce(length(p_provider_id),0)=0 then raise exception 'Missing provider message ID'; end if;
 update public.sms_recipients set status=p_status,provider=p_provider,provider_message_id=p_provider_id,error_message=left(p_error,300),sent_at=case when p_status='sent' then now() end
 where id=p_id and status='processing' returning campaign_id into cid;
 if cid is not null then perform private.refresh_campaign(cid); end if;
end $$;
create function public.record_sms_delivery(p_provider text,p_provider_id text,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 if p_status not in ('delivered','failed') then raise exception 'Invalid delivery status'; end if;
 update public.sms_recipients set status=p_status,delivered_at=case when p_status='delivered' then now() end
 where provider=p_provider and provider_message_id=p_provider_id and status in ('sent','uncertain') returning campaign_id into cid;
 if cid is not null then perform private.refresh_campaign(cid); end if;
end $$;
create function public.run_maintenance() returns void language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 update public.subscriptions set status='expired',updated_at=now() where status='active' and expires_at<=now();
 for cid in select id from public.sms_campaigns where status in ('queued','processing') loop perform private.refresh_campaign(cid); end loop;
end $$;

-- Timestamp-aware resident list view preserves RLS; pagination/filtering happens in PostgreSQL.
create view public.resident_directory with(security_invoker=true) as
select r.*, b.name as balozi_name,m.name as mtaa_name,
 coalesce((select array_agg(rc.category_id) from public.resident_categories rc where rc.resident_id=r.id),'{}'::uuid[]) category_ids,
 coalesce((select string_agg(c.name,', ' order by c.name) from public.resident_categories rc join public.categories c on c.id=rc.category_id where rc.resident_id=r.id),'') category_names,
 (select max(s.expires_at) from public.subscriptions s where s.resident_id=r.id and s.status in ('active','expired')) expires_at,
 case when exists(select 1 from public.subscriptions s where s.resident_id=r.id and s.status='active' and s.starts_at<=now() and s.expires_at>now()) then 'active'
 when exists(select 1 from public.subscriptions s where s.resident_id=r.id and s.status in ('active','expired') and s.expires_at<=now()) then 'expired' else 'pending' end subscription_status
from public.residents r join public.balozi_areas b on b.id=r.balozi_area_id join public.mitaa m on m.id=r.mtaa_id;
grant select on public.resident_directory to authenticated,service_role;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_mtaa_admin(uuid),private.is_active_admin() to authenticated;
revoke all on function public.create_payment(uuid,uuid,text,uuid),public.settle_payment(uuid,text,text,text,integer,text),public.preview_campaign(uuid,uuid,text,text,text,uuid,uuid,uuid[],integer),public.confirm_campaign(uuid,uuid),public.claim_sms(integer),public.record_sms_result(uuid,text,text,text,text),public.record_sms_delivery(text,text,text),public.run_maintenance() from public,anon,authenticated;
grant execute on function public.create_payment(uuid,uuid,text,uuid),public.settle_payment(uuid,text,text,text,integer,text),public.preview_campaign(uuid,uuid,text,text,text,uuid,uuid,uuid[],integer),public.confirm_campaign(uuid,uuid),public.claim_sms(integer),public.record_sms_result(uuid,text,text,text,text),public.record_sms_delivery(text,text,text),public.run_maintenance() to service_role;
