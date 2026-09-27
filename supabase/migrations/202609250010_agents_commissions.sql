-- Registration agents are authenticated staff assigned to one Mtaa. They use a
-- dedicated service boundary and never receive administrator database powers.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles drop constraint profiles_check;
alter table public.profiles add constraint profiles_role_check check(role in ('super_admin','mtaa_admin','agent'));
alter table public.profiles add constraint profiles_scope_check check(
 (role='super_admin' and mtaa_id is null) or (role in ('mtaa_admin','agent') and mtaa_id is not null)
);

alter table public.payments add column agent_id uuid references public.profiles;
create index payments_agent on public.payments(agent_id,created_at desc) where agent_id is not null;

create table public.agent_commissions (
 id uuid primary key default gen_random_uuid(),
 agent_id uuid not null references public.profiles,
 resident_id uuid not null references public.residents,
 payment_id uuid not null unique references public.payments,
 mtaa_id uuid not null references public.mitaa,
 amount integer not null default 300 check(amount=300),
 currency text not null default 'TZS' check(currency='TZS'),
 status text not null default 'earned' check(status in ('earned','paid','cancelled')),
 earned_at timestamptz not null default now(), paid_at timestamptz,
 created_at timestamptz not null default now(),
 check((status='paid' and paid_at is not null) or (status<>'paid' and paid_at is null))
);
create index agent_commissions_agent on public.agent_commissions(agent_id,status,earned_at desc);
create index agent_commissions_tenant on public.agent_commissions(mtaa_id,status,earned_at desc);
alter table public.agent_commissions enable row level security;
revoke all on public.agent_commissions from public,anon,authenticated;
grant select on public.agent_commissions to authenticated;
grant all on public.agent_commissions to service_role;
create policy agent_read_own_commissions on public.agent_commissions for select to authenticated using(agent_id=auth.uid());
create policy admin_read_tenant_commissions on public.agent_commissions for select to authenticated using(private.is_mtaa_admin(mtaa_id));

-- Agents are denied all existing administrator RPCs. Their one allowed mutation
-- has a dedicated function below.
create or replace function private.require_actor(actor uuid, tenant uuid default null, super_only boolean default false)
returns public.profiles language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
 select * into p from public.profiles where id=actor and status='active';
 if p.id is null then raise exception 'Unauthorized'; end if;
 if p.role='agent' then raise exception 'Forbidden'; end if;
 if super_only and p.role<>'super_admin' then raise exception 'Forbidden'; end if;
 if p.role='mtaa_admin' and (tenant is null or p.mtaa_id<>tenant or not exists(select 1 from public.mitaa where id=tenant and status='active')) then raise exception 'Forbidden'; end if;
 return p;
end $$;

create function private.require_agent(actor uuid,tenant uuid) returns public.profiles
language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
 select * into p from public.profiles where id=actor and role='agent' and status='active' and mtaa_id=tenant;
 if p.id is null or not exists(select 1 from public.mitaa where id=tenant and status='active') then raise exception 'Forbidden'; end if;
 return p;
end $$;

drop function public.manage_profile(uuid,uuid,text,uuid,text);
create function public.manage_profile(p_actor uuid,p_id uuid,p_name text,p_mtaa uuid,p_status text default 'active',p_role text default 'mtaa_admin') returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_actor(p_actor,null,true);
 if p_actor=p_id or exists(select 1 from public.profiles where id=p_id and role='super_admin') then raise exception 'Cannot modify super administrator here'; end if;
 if p_role not in ('mtaa_admin','agent') or p_status not in ('active','suspended') or not exists(select 1 from public.mitaa where id=p_mtaa and status='active') then raise exception 'Invalid staff profile'; end if;
 insert into public.profiles(id,full_name,role,mtaa_id,status) values(p_id,trim(p_name),p_role,p_mtaa,p_status)
 on conflict(id) do update set full_name=excluded.full_name,role=excluded.role,mtaa_id=excluded.mtaa_id,status=excluded.status;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id,metadata)
 values(p_actor,'staff.saved','profile',p_id,p_mtaa,jsonb_build_object('role',p_role,'status',p_status));
end $$;

create function public.register_agent_resident(p_actor uuid,p_mtaa uuid,p_balozi uuid,p_name text,p_phone text,
 p_categories uuid[],p_consent boolean,p_provider text,p_key uuid,p_groups uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare rid uuid; pid uuid; groups uuid[]; old_payment public.payments;
begin
 perform private.require_agent(p_actor,p_mtaa);
 select * into old_payment from public.payments where idempotency_key=p_key;
 if found then
  if old_payment.agent_id<>p_actor or old_payment.mtaa_id<>p_mtaa or old_payment.provider<>p_provider then raise exception 'Idempotency conflict'; end if;
  return jsonb_build_object('resident_id',old_payment.resident_id,'payment_id',old_payment.id);
 end if;
 if p_consent is distinct from true or p_provider not in ('pending','mock') then raise exception 'Invalid registration'; end if;
 if coalesce(cardinality(p_categories),0) not between 1 and 2 then raise exception 'Select one or two categories'; end if;
 if p_balozi is not null and not exists(select 1 from public.balozi_areas where id=p_balozi and mtaa_id=p_mtaa and status='active') then raise exception 'Invalid Balozi'; end if;
 groups:=coalesce((select array_agg(distinct g) from unnest(p_groups) g),'{}'::uuid[]);
 if (select count(distinct v.field_id) from public.grouping_values v where v.id=any(groups))<>cardinality(groups) then raise exception 'One value per grouping field'; end if;
 if exists(select 1 from unnest(groups) g where not exists(select 1 from public.grouping_values v join public.grouping_fields f on f.id=v.field_id
  where v.id=g and v.status='active' and f.status='active' and (f.mtaa_id is null or f.mtaa_id=p_mtaa))) then raise exception 'Invalid group value'; end if;
 insert into public.residents(mtaa_id,balozi_area_id,full_name,phone_number,consent_at,consent_version,created_by,registration_status)
 values(p_mtaa,p_balozi,trim(p_name),p_phone,now(),'2026-09-agent-v1',p_actor,'pending') returning id into rid;
 insert into public.resident_categories(resident_id,category_id) select rid,unnest(p_categories);
 if cardinality(groups)>0 then insert into public.resident_groups(resident_id,value_id,field_id) select rid,v.id,v.field_id from public.grouping_values v where v.id=any(groups); end if;
 insert into public.payments(resident_id,mtaa_id,provider,idempotency_key,agent_id) values(rid,p_mtaa,p_provider,p_key,p_actor) returning id into pid;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id,metadata)
 values(p_actor,'agent.registration','resident',rid,p_mtaa,jsonb_build_object('payment_id',pid));
 return jsonb_build_object('resident_id',rid,'payment_id',pid);
end $$;

create function public.agent_commission_summary(p_actor uuid,p_agent uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor_profile public.profiles; target public.profiles;
begin
 select * into actor_profile from public.profiles where id=p_actor and status='active';
 select * into target from public.profiles where id=p_agent and role='agent';
 if target.id is null then raise exception 'Agent not found'; end if;
 if actor_profile.id is null or (p_actor<>p_agent and actor_profile.role<>'super_admin') then raise exception 'Forbidden'; end if;
 return jsonb_build_object(
  'registrations',(select count(*) from public.residents where created_by=p_agent),
  'successful_registrations',(select count(*) from public.payments where agent_id=p_agent and status='successful'),
  'pending_payments',(select count(*) from public.payments where agent_id=p_agent and status='pending'),
  'earned_total',coalesce((select sum(amount) from public.agent_commissions where agent_id=p_agent and status in ('earned','paid')),0),
  'paid_total',coalesce((select sum(amount) from public.agent_commissions where agent_id=p_agent and status='paid'),0),
  'balance',coalesce((select sum(amount) from public.agent_commissions where agent_id=p_agent and status='earned'),0)
 );
end $$;

-- Recreate settlement so a verified agent-originated payment earns exactly one
-- TSh 300 commission. Browser requests can never call this service-only RPC.
create or replace function public.settle_payment(p_payment uuid,p_provider text,p_reference text,p_event text,p_amount integer,p_currency text)
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
 perform 1 from public.residents where id=p.resident_id for update;
 select greatest(now(),coalesce(max(expires_at),now())) into start_time from public.subscriptions where resident_id=p.resident_id and status='active';
 insert into public.subscriptions(resident_id,mtaa_id,starts_at,expires_at) values(p.resident_id,p.mtaa_id,start_time,(start_time at time zone 'Africa/Dar_es_Salaam' + interval '6 months') at time zone 'Africa/Dar_es_Salaam') returning id into sid;
 update public.payments set status='successful',provider_reference=p_reference,subscription_id=sid,paid_at=now() where id=p.id;
 if p.agent_id is not null then
  insert into public.agent_commissions(agent_id,resident_id,payment_id,mtaa_id) values(p.agent_id,p.resident_id,p.id,p.mtaa_id) on conflict(payment_id) do nothing;
 end if;
 perform private.queue_welcome(p.resident_id);
 insert into public.audit_logs(action,entity_type,entity_id,mtaa_id,metadata) values('payment.verified','payment',p.id,p.mtaa_id,jsonb_build_object('subscription_id',sid,'provider',p_provider,'agent_id',p.agent_id));
 return sid;
end $$;

revoke all on function private.require_agent(uuid,uuid) from public,anon,authenticated;
revoke all on function public.manage_profile(uuid,uuid,text,uuid,text,text),public.register_agent_resident(uuid,uuid,uuid,text,text,uuid[],boolean,text,uuid,uuid[]),public.agent_commission_summary(uuid,uuid) from public,anon,authenticated;
grant execute on function public.manage_profile(uuid,uuid,text,uuid,text,text),public.register_agent_resident(uuid,uuid,uuid,text,text,uuid[],boolean,text,uuid,uuid[]),public.agent_commission_summary(uuid,uuid) to service_role;
