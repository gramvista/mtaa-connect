-- Administrator-defined grouping fields. A scope-null field is platform-wide and
-- only a Super Admin may create it. Each Resident holds at most one value per field.
-- Balozi is optional: a resident still belongs to exactly one Mtaa, while a known
-- Balozi area can be attached later by an administrator.
alter table public.residents alter column balozi_area_id drop not null;

create table public.grouping_fields (
 id uuid primary key default gen_random_uuid(),
 mtaa_id uuid references public.mitaa,
 name text not null check(length(trim(name)) between 2 and 80),
 status text not null default 'active' check(status in ('active','inactive')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,mtaa_id)
);
create unique index grouping_field_scope_name on public.grouping_fields(coalesce(mtaa_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(name));
create index grouping_fields_mtaa on public.grouping_fields(mtaa_id);

create table public.grouping_values (
 id uuid primary key default gen_random_uuid(),
 field_id uuid not null references public.grouping_fields on delete cascade,
 name text not null check(length(trim(name)) between 1 and 80),
 status text not null default 'active' check(status in ('active','inactive')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,field_id)
);
create unique index grouping_value_field_name on public.grouping_values(field_id,lower(name));
create index grouping_values_field on public.grouping_values(field_id);

-- The primary key (resident_id,field_id) guarantees one value per grouping field.
create table public.resident_groups (
 resident_id uuid not null references public.residents on delete cascade,
 value_id uuid not null,
 field_id uuid not null,
 primary key(resident_id,field_id),
 foreign key(value_id,field_id) references public.grouping_values(id,field_id)
);
create index resident_groups_value on public.resident_groups(value_id,resident_id);

do $$ declare t text; begin
 foreach t in array array['grouping_fields','grouping_values'] loop
 execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',t);
 end loop;
end $$;

-- Tenant + active-state validation mirrors private.check_resident_category.
create function private.check_resident_group() returns trigger language plpgsql security definer set search_path='' as $$
declare tenant uuid; value_tenant uuid; field_status text; value_status text;
begin
 select mtaa_id into tenant from public.residents where id=new.resident_id for update;
 if tenant is null then raise exception 'Resident not found'; end if;
 select f.mtaa_id,f.status,v.status into value_tenant,field_status,value_status
 from public.grouping_values v join public.grouping_fields f on f.id=v.field_id where v.id=new.value_id;
 if field_status is distinct from 'active' or value_status is distinct from 'active'
 or (value_tenant is not null and value_tenant<>tenant) then raise exception 'Invalid group value'; end if;
 return new;
end $$;
create trigger check_group before insert or update on public.resident_groups for each row execute function private.check_resident_group();

do $$ declare t text; begin
 foreach t in array array['grouping_fields','grouping_values','resident_groups'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create policy read_grouping_fields on public.grouping_fields for select to authenticated using((mtaa_id is null and private.is_active_admin()) or private.is_mtaa_admin(mtaa_id));
create policy read_grouping_values on public.grouping_values for select to authenticated using(exists(select 1 from public.grouping_fields f where f.id=field_id and ((f.mtaa_id is null and private.is_active_admin()) or private.is_mtaa_admin(f.mtaa_id))));
create policy read_resident_groups on public.resident_groups for select to authenticated using(exists(select 1 from public.residents r where r.id=resident_id and private.is_mtaa_admin(r.mtaa_id)));

create function public.save_grouping_field(p_actor uuid,p_mtaa uuid,p_name text,p_status text default 'active',p_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 if p_status not in ('active','inactive') then raise exception 'Invalid status'; end if;
 perform private.require_actor(p_actor,p_mtaa,p_mtaa is null);
 if p_id is null then
  insert into public.grouping_fields(mtaa_id,name,status) values(p_mtaa,trim(p_name),p_status) returning id into rid;
 else
  update public.grouping_fields set name=trim(p_name),status=p_status where id=p_id and mtaa_id is not distinct from p_mtaa returning id into rid;
  if rid is null then raise exception 'Grouping field not found'; end if;
 end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id) values(p_actor,'grouping_field.'||case when p_id is null then 'created' else 'updated' end,'grouping_field',rid,p_mtaa);
 return rid;
end $$;

create function public.save_grouping_value(p_actor uuid,p_field uuid,p_name text,p_status text default 'active',p_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid; field_tenant uuid;
begin
 if p_status not in ('active','inactive') then raise exception 'Invalid status'; end if;
 select mtaa_id into field_tenant from public.grouping_fields where id=p_field;
 if field_tenant is null and not exists(select 1 from public.grouping_fields where id=p_field) then raise exception 'Grouping field not found'; end if;
 perform private.require_actor(p_actor,field_tenant,field_tenant is null);
 if p_id is null then
  insert into public.grouping_values(field_id,name,status) values(p_field,trim(p_name),p_status) returning id into rid;
 else
  update public.grouping_values set name=trim(p_name),status=p_status where id=p_id and field_id=p_field returning id into rid;
  if rid is null then raise exception 'Grouping value not found'; end if;
 end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id) values(p_actor,'grouping_value.'||case when p_id is null then 'created' else 'updated' end,'grouping_value',rid,field_tenant);
 return rid;
end $$;

-- Replace a Resident's grouping value set. At most one value per field is kept.
create function public.set_resident_groups(p_actor uuid,p_resident uuid,p_values uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare tenant uuid; groups uuid[];
begin
 select mtaa_id into tenant from public.residents where id=p_resident for update;
 if tenant is null then raise exception 'Resident not found'; end if;
 perform private.require_actor(p_actor,tenant);
 groups:=coalesce((select array_agg(distinct g) from unnest(p_values) g),'{}'::uuid[]);
 if (select count(distinct v.field_id) from public.grouping_values v where v.id=any(groups))<>cardinality(groups) then raise exception 'One value per grouping field'; end if;
 if exists(select 1 from unnest(groups) g where not exists(select 1 from public.grouping_values v join public.grouping_fields f on f.id=v.field_id
  where v.id=g and v.status='active' and f.status='active' and (f.mtaa_id is null or f.mtaa_id=tenant))) then raise exception 'Invalid group value'; end if;
 delete from public.resident_groups where resident_id=p_resident;
 insert into public.resident_groups(resident_id,value_id,field_id) select p_resident,v.id,v.field_id from public.grouping_values v where v.id=any(groups);
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id) values(p_actor,'resident.groups','resident',p_resident,tenant);
end $$;

-- Recreate save_resident with grouping assignments; existing callers stay valid via defaults.
drop function public.save_resident(uuid,uuid,uuid,text,text,uuid[],boolean,boolean,uuid);
create function public.save_resident(p_actor uuid, p_mtaa uuid, p_balozi uuid, p_name text, p_phone text,
 p_categories uuid[], p_approved boolean, p_consent boolean, p_id uuid default null, p_groups uuid[] default '{}')
returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid; existing public.residents; groups uuid[];
begin
 perform private.require_actor(p_actor,p_mtaa);
 if not p_consent then raise exception 'Consent required'; end if;
 if coalesce(cardinality(p_categories),0) not between 1 and 2 then raise exception 'Select one or two categories'; end if;
 if not exists(select 1 from public.mitaa where id=p_mtaa and status='active') then raise exception 'Invalid active Mtaa'; end if;
 if p_balozi is not null and not exists(select 1 from public.balozi_areas b where b.id=p_balozi and b.mtaa_id=p_mtaa and b.status='active') then raise exception 'Invalid active Balozi area'; end if;
 groups:=coalesce((select array_agg(distinct g) from unnest(p_groups) g),'{}'::uuid[]);
 if (select count(distinct v.field_id) from public.grouping_values v where v.id=any(groups))<>cardinality(groups) then raise exception 'One value per grouping field'; end if;
 if exists(select 1 from unnest(groups) g where not exists(select 1 from public.grouping_values v join public.grouping_fields f on f.id=v.field_id
  where v.id=g and v.status='active' and f.status='active' and (f.mtaa_id is null or f.mtaa_id=p_mtaa))) then raise exception 'Invalid group value'; end if;
 if p_id is null then
  insert into public.residents(mtaa_id,balozi_area_id,full_name,phone_number,consent_at,created_by,registration_status,approved_by,approved_at)
  values(p_mtaa,p_balozi,trim(p_name),p_phone,now(),p_actor,case when p_approved then 'approved' else 'pending' end,case when p_approved then p_actor end,case when p_approved then now() end) returning id into rid;
 else
  select * into existing from public.residents where id=p_id for update;
  if existing.id is null or existing.mtaa_id<>p_mtaa then raise exception 'Resident not found'; end if;
  rid=p_id;
  update public.residents set balozi_area_id=p_balozi,full_name=trim(p_name),phone_number=p_phone,
  registration_status=case when p_approved then 'approved' else 'pending' end,
  approved_by=case when p_approved then p_actor end,approved_at=case when p_approved then coalesce(approved_at,now()) end where id=rid;
  delete from public.resident_categories where resident_id=rid;
 end if;
 insert into public.resident_categories(resident_id,category_id) select rid,unnest(p_categories);
 delete from public.resident_groups where resident_id=rid;
 if cardinality(groups)>0 then
  insert into public.resident_groups(resident_id,value_id,field_id) select rid,v.id,v.field_id from public.grouping_values v where v.id=any(groups);
 end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id) values(p_actor,case when p_id is null then 'resident.created' else 'resident.updated' end,'resident',rid,p_mtaa);
 return rid;
end $$;

alter table public.sms_campaigns drop constraint sms_campaigns_target_type_check;
alter table public.sms_campaigns add constraint sms_campaigns_target_type_check check(target_type in ('all','balozi','category','balozi_category','selected','welcome','group'));

-- Recreate preview_campaign with an optional grouping-field/value target.
drop function public.preview_campaign(uuid,uuid,text,text,text,uuid,uuid,uuid[],integer);
create function public.preview_campaign(p_actor uuid,p_mtaa uuid,p_title text,p_message text,p_type text,p_balozi uuid,p_category uuid,p_selected uuid[],p_units integer,p_group_field uuid default null,p_group_value uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 perform private.require_actor(p_actor,p_mtaa);
 if p_type not in ('all','balozi','category','balozi_category','selected','group') then raise exception 'Invalid target'; end if;
 if p_type in ('balozi','balozi_category') and not exists(select 1 from public.balozi_areas where id=p_balozi and mtaa_id=p_mtaa and status='active') then raise exception 'Invalid Balozi'; end if;
 if p_type in ('category','balozi_category') and not exists(select 1 from public.categories where id=p_category and (mtaa_id is null or mtaa_id=p_mtaa) and status='active') then raise exception 'Invalid category'; end if;
 if p_type='group' and not exists(select 1 from public.grouping_values v join public.grouping_fields f on f.id=v.field_id
  where v.id=p_group_value and v.field_id=p_group_field and v.status='active' and f.status='active' and (f.mtaa_id is null or f.mtaa_id=p_mtaa)) then raise exception 'Invalid group value'; end if;
 if p_type='selected' and (coalesce(cardinality(p_selected),0) not between 1 and 500 or exists(select 1 from unnest(p_selected) x where not exists(select 1 from public.residents where id=x and mtaa_id=p_mtaa))) then raise exception 'Invalid selected residents'; end if;
 insert into public.sms_campaigns(mtaa_id,created_by,title,message,target_type,target,units_per_message)
 values(p_mtaa,p_actor,trim(p_title),trim(p_message),p_type,jsonb_build_object('balozi',p_balozi,'category',p_category,'group_field',p_group_field,'group_value',p_group_value),p_units) returning id into cid;
 insert into public.sms_recipients(campaign_id,resident_id,mtaa_id,phone_number_snapshot)
 select cid,r.id,r.mtaa_id,r.phone_number from public.residents r
 where r.mtaa_id=p_mtaa and private.eligible(r.id)
 and (p_type not in ('balozi','balozi_category') or r.balozi_area_id=p_balozi)
 and (p_type not in ('category','balozi_category') or exists(select 1 from public.resident_categories rc where rc.resident_id=r.id and rc.category_id=p_category))
 and (p_type<>'group' or exists(select 1 from public.resident_groups rg where rg.resident_id=r.id and rg.field_id=p_group_field and rg.value_id=p_group_value))
 and (p_type<>'selected' or r.id=any(p_selected));
 update public.sms_campaigns set total_recipients=(select count(*) from public.sms_recipients where campaign_id=cid) where id=cid;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id) values(p_actor,'campaign.preview','campaign',cid,p_mtaa);
 return cid;
end $$;

-- Expose grouping labels for the resident directory and tenant-safe filtering.
create or replace view public.resident_directory with(security_invoker=true) as
select r.*, coalesce(b.name,'') as balozi_name,m.name as mtaa_name,
 coalesce((select array_agg(rc.category_id) from public.resident_categories rc where rc.resident_id=r.id),'{}'::uuid[]) category_ids,
 coalesce((select string_agg(c.name,', ' order by c.name) from public.resident_categories rc join public.categories c on c.id=rc.category_id where rc.resident_id=r.id),'') category_names,
 (select max(s.expires_at) from public.subscriptions s where s.resident_id=r.id and s.status in ('active','expired')) expires_at,
 case when exists(select 1 from public.subscriptions s where s.resident_id=r.id and s.status='active' and s.starts_at<=now() and s.expires_at>now()) then 'active'
 when exists(select 1 from public.subscriptions s where s.resident_id=r.id and s.status in ('active','expired') and s.expires_at<=now()) then 'expired' else 'pending' end subscription_status,
 coalesce((select array_agg(rg.value_id) from public.resident_groups rg where rg.resident_id=r.id),'{}'::uuid[]) group_value_ids,
 coalesce((select string_agg(f.name||': '||v.name,', ' order by f.name) from public.resident_groups rg join public.grouping_values v on v.id=rg.value_id join public.grouping_fields f on f.id=rg.field_id where rg.resident_id=r.id),'') group_names
from public.residents r left join public.balozi_areas b on b.id=r.balozi_area_id join public.mitaa m on m.id=r.mtaa_id;
grant select on public.resident_directory to authenticated,service_role;

-- Eligibility allows an optional Balozi, but validates it when present.
create or replace function private.eligible(rid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.residents r join public.mitaa m on m.id=r.mtaa_id
 left join public.balozi_areas b on b.id=r.balozi_area_id
 where r.id=rid and r.status='active' and r.registration_status='approved' and m.status='active'
 and (r.balozi_area_id is null or (b.status='active' and b.mtaa_id=r.mtaa_id))
 and exists(select 1 from public.subscriptions s where s.resident_id=r.id and s.status='active' and s.starts_at<=now() and s.expires_at>now()))
$$;

-- Replace the public-registration boundary so Balozi and custom groups are optional.
drop function public.register_public_resident(text,text,uuid,uuid,text,text,uuid[],boolean,text);
create function public.register_public_resident(p_token text,p_request text,p_mtaa uuid,p_balozi uuid,p_name text,p_phone text,p_categories uuid[],p_consent boolean,p_provider text,p_groups uuid[] default '{}')
returns uuid language plpgsql security definer set search_path='' as $$
declare old_session private.registration_sessions; rid uuid; pid uuid; groups uuid[];
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' or p_request is null or p_request !~ '^[a-f0-9]{64}$' then raise exception 'Invalid session'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_token,0));
 select * into old_session from private.registration_sessions where token_hash=p_token;
 if found then
  if old_session.expires_at<=now() or old_session.request_hash<>p_request then raise exception 'Session conflict'; end if;
  return old_session.payment_id;
 end if;
 if p_consent is distinct from true or p_provider is null or p_provider not in ('pending','mock') then raise exception 'Invalid registration'; end if;
 if coalesce(cardinality(p_categories),0) not between 1 and 2 then raise exception 'Select one or two categories'; end if;
 if not exists(select 1 from public.mitaa where id=p_mtaa and status='active') then raise exception 'Invalid Mtaa'; end if;
 if p_balozi is not null and not exists(select 1 from public.balozi_areas b where b.id=p_balozi and b.mtaa_id=p_mtaa and b.status='active') then raise exception 'Invalid area'; end if;
 groups:=coalesce((select array_agg(distinct g) from unnest(p_groups) g),'{}'::uuid[]);
 if (select count(distinct v.field_id) from public.grouping_values v where v.id=any(groups))<>cardinality(groups) then raise exception 'One value per grouping field'; end if;
 if exists(select 1 from unnest(groups) g where not exists(select 1 from public.grouping_values v join public.grouping_fields f on f.id=v.field_id
  where v.id=g and v.status='active' and f.status='active' and (f.mtaa_id is null or f.mtaa_id=p_mtaa))) then raise exception 'Invalid group value'; end if;
 insert into public.residents(mtaa_id,balozi_area_id,full_name,phone_number,consent_at,consent_version,registration_status)
 values(p_mtaa,p_balozi,trim(p_name),p_phone,now(),'2026-09-public-v1','pending') returning id into rid;
 insert into public.resident_categories(resident_id,category_id) select rid,unnest(p_categories);
 if cardinality(groups)>0 then insert into public.resident_groups(resident_id,value_id,field_id) select rid,v.id,v.field_id from public.grouping_values v where v.id=any(groups); end if;
 insert into public.payments(resident_id,mtaa_id,provider,idempotency_key,amount,currency)
 values(rid,p_mtaa,p_provider,gen_random_uuid(),3000,'TZS') returning id into pid;
 insert into private.registration_sessions(token_hash,request_hash,resident_id,payment_id) values(p_token,p_request,rid,pid);
 insert into public.audit_logs(action,entity_type,entity_id,mtaa_id,metadata)
 values('resident.self_registered','resident',rid,p_mtaa,jsonb_build_object('payment_id',pid,'consent_version','2026-09-public-v1'));
 return pid;
end $$;

revoke all on function public.save_grouping_field(uuid,uuid,text,text,uuid),public.save_grouping_value(uuid,uuid,text,text,uuid),public.set_resident_groups(uuid,uuid,uuid[]),public.save_resident(uuid,uuid,uuid,text,text,uuid[],boolean,boolean,uuid,uuid[]),public.preview_campaign(uuid,uuid,text,text,text,uuid,uuid,uuid[],integer,uuid,uuid),public.register_public_resident(text,text,uuid,uuid,text,text,uuid[],boolean,text,uuid[]) from public,anon,authenticated;
grant execute on function public.save_grouping_field(uuid,uuid,text,text,uuid),public.save_grouping_value(uuid,uuid,text,text,uuid),public.set_resident_groups(uuid,uuid,uuid[]),public.save_resident(uuid,uuid,uuid,text,text,uuid[],boolean,boolean,uuid,uuid[]),public.preview_campaign(uuid,uuid,text,text,text,uuid,uuid,uuid[],integer,uuid,uuid),public.register_public_resident(text,text,uuid,uuid,text,text,uuid[],boolean,text,uuid[]) to service_role;
