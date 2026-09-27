-- Tenant foundation. No real location or resident data is seeded.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create table public.regions (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 2 and 100), unique(name)
);
create table public.districts (
 id uuid primary key default gen_random_uuid(), region_id uuid not null references public.regions,
 name text not null check(length(trim(name)) between 2 and 100), unique(region_id,name)
);
create table public.wards (
 id uuid primary key default gen_random_uuid(), district_id uuid not null references public.districts,
 name text not null check(length(trim(name)) between 2 and 100), unique(district_id,name)
);
create table public.mitaa (
 id uuid primary key default gen_random_uuid(), ward_id uuid not null references public.wards,
 name text not null check(length(trim(name)) between 2 and 100), status text not null default 'active' check(status in ('active','inactive')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(ward_id,name)
);
create table public.profiles (
 id uuid primary key references auth.users on delete restrict,
 full_name text not null check(length(trim(full_name)) between 2 and 120),
 role text not null check(role in ('super_admin','mtaa_admin')), mtaa_id uuid references public.mitaa,
 status text not null default 'active' check(status in ('active','suspended')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((role='super_admin' and mtaa_id is null) or (role='mtaa_admin' and mtaa_id is not null))
);
create index profiles_mtaa on public.profiles(mtaa_id);
create table public.balozi_areas (
 id uuid primary key default gen_random_uuid(), mtaa_id uuid not null references public.mitaa,
 name text not null check(length(trim(name)) between 2 and 100), balozi_name text not null default '' check(length(balozi_name)<=120),
 status text not null default 'active' check(status in ('active','inactive')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(mtaa_id,name), unique(id,mtaa_id)
);
create table public.categories (
 id uuid primary key default gen_random_uuid(), mtaa_id uuid references public.mitaa,
 name text not null check(length(trim(name)) between 2 and 80), status text not null default 'active' check(status in ('active','inactive')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index category_scope_name on public.categories(coalesce(mtaa_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(name));
create index categories_mtaa on public.categories(mtaa_id);
create table public.residents (
 id uuid primary key default gen_random_uuid(), mtaa_id uuid not null references public.mitaa,
 balozi_area_id uuid not null, full_name text not null check(length(trim(full_name)) between 2 and 120),
 phone_number text not null check(phone_number ~ '^\+255[67][0-9]{8}$'),
 status text not null default 'active' check(status in ('active','suspended')),
 registration_status text not null default 'pending' check(registration_status in ('pending','approved','rejected')),
 consent_at timestamptz not null, consent_version text not null default '2026-09-v1',
 created_by uuid references public.profiles, approved_by uuid references public.profiles, approved_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(balozi_area_id,mtaa_id) references public.balozi_areas(id,mtaa_id),
 unique(mtaa_id,phone_number), unique(id,mtaa_id)
);
create index residents_balozi on public.residents(mtaa_id,balozi_area_id);
create index residents_phone on public.residents(phone_number);
create index residents_registration on public.residents(mtaa_id,registration_status,status,created_at desc);
create index residents_creator on public.residents(created_by);
create index residents_approver on public.residents(approved_by);
create table public.resident_categories (
 resident_id uuid not null references public.residents on delete cascade,
 category_id uuid not null references public.categories, primary key(resident_id,category_id)
);
create index resident_categories_category on public.resident_categories(category_id,resident_id);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles,
 action text not null, entity_type text not null, entity_id uuid, mtaa_id uuid references public.mitaa,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index audit_tenant_date on public.audit_logs(mtaa_id,created_at desc);
create index audit_actor on public.audit_logs(actor_id);

create function private.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end $$;
do $$ declare t text; begin
 foreach t in array array['mitaa','profiles','balozi_areas','categories','residents'] loop
 execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',t);
 end loop;
end $$;

-- No super-admin bypass in browser RLS. Super Admin uses trusted server operations.
create function private.is_mtaa_admin(tenant uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join public.mitaa m on m.id=p.mtaa_id
 where p.id=auth.uid() and p.role='mtaa_admin' and p.status='active' and p.mtaa_id=tenant and m.status='active')
$$;
create function private.is_active_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='active'
 and (p.role='super_admin' or exists(select 1 from public.mitaa m where m.id=p.mtaa_id and m.status='active')))
$$;
revoke all on all functions in schema private from public;
grant execute on function private.is_mtaa_admin(uuid), private.is_active_admin() to authenticated;

do $$ declare t text; begin
 foreach t in array array['regions','districts','wards','mitaa','profiles','balozi_areas','categories','residents','resident_categories','audit_logs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create policy read_regions on public.regions for select to authenticated using(private.is_active_admin());
create policy read_districts on public.districts for select to authenticated using(private.is_active_admin());
create policy read_wards on public.wards for select to authenticated using(private.is_active_admin());
create policy read_mtaa on public.mitaa for select to authenticated using(private.is_mtaa_admin(id));
create policy read_self_profile on public.profiles for select to authenticated using(id=auth.uid());
create policy read_balozi on public.balozi_areas for select to authenticated using(private.is_mtaa_admin(mtaa_id));
create policy read_categories on public.categories for select to authenticated using((mtaa_id is null and private.is_active_admin()) or private.is_mtaa_admin(mtaa_id));
create policy read_residents on public.residents for select to authenticated using(private.is_mtaa_admin(mtaa_id));
create policy read_resident_categories on public.resident_categories for select to authenticated using(exists(select 1 from public.residents r where r.id=resident_id and private.is_mtaa_admin(r.mtaa_id)));
create policy read_audit on public.audit_logs for select to authenticated using(private.is_mtaa_admin(mtaa_id));

-- Serialize category edits per resident and enforce tenant + maximum-two constraint.
create function private.check_resident_category() returns trigger language plpgsql security definer set search_path='' as $$
declare tenant uuid; category_tenant uuid; category_status text;
begin
 select mtaa_id into tenant from public.residents where id=new.resident_id for update;
 select mtaa_id,status into category_tenant,category_status from public.categories where id=new.category_id;
 if category_status is distinct from 'active' or (category_tenant is not null and category_tenant<>tenant) then raise exception 'Invalid category'; end if;
 if (select count(*) from public.resident_categories where resident_id=new.resident_id)>=2 then raise exception 'Maximum two categories'; end if;
 return new;
end $$;
create trigger check_category before insert on public.resident_categories for each row execute function private.check_resident_category();

-- Actor arguments are accepted only by service_role, never browser roles.
create function private.require_actor(actor uuid, tenant uuid default null, super_only boolean default false)
returns public.profiles language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
 select * into p from public.profiles where id=actor and status='active';
 if p.id is null then raise exception 'Unauthorized'; end if;
 if super_only and p.role<>'super_admin' then raise exception 'Forbidden'; end if;
 if p.role='mtaa_admin' and (tenant is null or p.mtaa_id<>tenant or not exists(select 1 from public.mitaa where id=tenant and status='active')) then raise exception 'Forbidden'; end if;
 return p;
end $$;

create function public.save_resident(p_actor uuid, p_mtaa uuid, p_balozi uuid, p_name text, p_phone text,
 p_categories uuid[], p_approved boolean, p_consent boolean, p_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid; existing public.residents;
begin
 perform private.require_actor(p_actor,p_mtaa);
 if not p_consent then raise exception 'Consent required'; end if;
 if coalesce(cardinality(p_categories),0) not between 1 and 2 then raise exception 'Select one or two categories'; end if;
 if not exists(select 1 from public.balozi_areas b join public.mitaa m on m.id=b.mtaa_id where b.id=p_balozi and b.mtaa_id=p_mtaa and b.status='active' and m.status='active') then raise exception 'Invalid active Balozi area'; end if;
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
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id) values(p_actor,case when p_id is null then 'resident.created' else 'resident.updated' end,'resident',rid,p_mtaa);
 return rid;
end $$;

create function public.set_resident_status(p_actor uuid,p_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare tenant uuid;
begin
 select mtaa_id into tenant from public.residents where id=p_id for update;
 if tenant is null then raise exception 'Resident not found'; end if;
 perform private.require_actor(p_actor,tenant);
 update public.residents set status=p_status where id=p_id;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id,metadata) values(p_actor,'resident.status','resident',p_id,tenant,jsonb_build_object('status',p_status));
end $$;

create function public.save_location(p_actor uuid,p_kind text,p_name text,p_parent uuid default null,p_id uuid default null,p_status text default 'active',p_balozi_name text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid; tenant uuid;
begin
 if p_kind not in ('regions','districts','wards','mitaa','balozi_areas','categories') then raise exception 'Invalid location type'; end if;
 if p_kind in ('balozi_areas','categories') then
  perform private.require_actor(p_actor,p_parent,p_parent is null);
  tenant=p_parent;
 else perform private.require_actor(p_actor,null,true); end if;
 if p_id is not null then
  -- Editing is limited to scoped Balozi/category names and Mtaa status. Parents are immutable.
  if p_kind='balozi_areas' then
   update public.balozi_areas set name=trim(p_name),balozi_name=p_balozi_name,status=p_status where id=p_id and mtaa_id=p_parent returning id into rid;
  elsif p_kind='categories' then
   update public.categories set name=trim(p_name),status=p_status where id=p_id and mtaa_id is not distinct from p_parent returning id into rid;
  elsif p_kind='mitaa' then
   update public.mitaa set name=trim(p_name),status=p_status where id=p_id and ward_id=p_parent returning id into rid;
   tenant=rid;
  else raise exception 'Unsupported edit'; end if;
  if rid is null then raise exception 'Record not found'; end if;
 else
  case p_kind
  when 'regions' then insert into public.regions(name) values(trim(p_name)) returning id into rid;
  when 'districts' then insert into public.districts(name,region_id) values(trim(p_name),p_parent) returning id into rid;
  when 'wards' then insert into public.wards(name,district_id) values(trim(p_name),p_parent) returning id into rid;
  when 'mitaa' then insert into public.mitaa(name,ward_id) values(trim(p_name),p_parent) returning id into rid; tenant=rid;
  when 'balozi_areas' then insert into public.balozi_areas(name,mtaa_id,balozi_name) values(trim(p_name),p_parent,p_balozi_name) returning id into rid;
  when 'categories' then insert into public.categories(name,mtaa_id) values(trim(p_name),p_parent) returning id into rid;
  end case;
 end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id) values(p_actor,p_kind||case when p_id is null then '.created' else '.updated' end,p_kind,rid,tenant);
 return rid;
end $$;

create function public.manage_profile(p_actor uuid,p_id uuid,p_name text,p_mtaa uuid,p_status text default 'active') returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_actor(p_actor,null,true);
 if p_actor=p_id or exists(select 1 from public.profiles where id=p_id and role='super_admin') then raise exception 'Cannot modify super administrator here'; end if;
 insert into public.profiles(id,full_name,role,mtaa_id,status) values(p_id,trim(p_name),'mtaa_admin',p_mtaa,p_status)
 on conflict(id) do update set full_name=excluded.full_name,mtaa_id=excluded.mtaa_id,status=excluded.status;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id) values(p_actor,'administrator.saved','profile',p_id,p_mtaa);
end $$;

insert into public.categories(name) values ('Wanawake'),('Wanaume'),('Vijana'),('Wazee');

revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_mtaa_admin(uuid),private.is_active_admin() to authenticated;
revoke all on function public.save_resident(uuid,uuid,uuid,text,text,uuid[],boolean,boolean,uuid),public.set_resident_status(uuid,uuid,text),public.save_location(uuid,text,text,uuid,uuid,text,text),public.manage_profile(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.save_resident(uuid,uuid,uuid,text,text,uuid[],boolean,boolean,uuid),public.set_resident_status(uuid,uuid,text),public.save_location(uuid,text,text,uuid,uuid,text,text),public.manage_profile(uuid,uuid,text,uuid,text) to service_role;
