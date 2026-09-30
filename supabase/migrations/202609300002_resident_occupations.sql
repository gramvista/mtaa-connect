-- A resident's occupation is independent from demographic categories. The
-- controlled list keeps reporting consistent while "nyingine" retains the
-- exact trade entered by the resident.
create table public.occupations (
 code text primary key check(code ~ '^[a-z0-9_]{2,40}$'),
 name text not null check(length(trim(name)) between 2 and 80),
 sort_order smallint not null unique check(sort_order between 1 and 1000),
 requires_detail boolean not null default false,
 status text not null default 'active' check(status in ('active','inactive'))
);

insert into public.occupations(code,name,sort_order,requires_detail) values
 ('mfanyabiashara','Mfanyabiashara',10,false),
 ('fundi_gereji','Fundi magari / gereji',20,false),
 ('fundi_ujenzi','Fundi ujenzi (civil)',30,false),
 ('fundi_umeme','Fundi umeme',40,false),
 ('fundi_bomba','Fundi bomba',50,false),
 ('fundi_seremala','Fundi seremala',60,false),
 ('fundi_cherehani','Fundi cherehani',70,false),
 ('fundi_simuna_elektroniki','Fundi simu / elektroniki',80,false),
 ('mkulima','Mkulima',90,false),
 ('mfugaji','Mfugaji',100,false),
 ('mvuvi','Mvuvi',110,false),
 ('dereva','Dereva',120,false),
 ('mwalimu','Mwalimu',130,false),
 ('mhudumu_afya','Mhudumu wa afya',140,false),
 ('mwajiriwa','Mwajiriwa',150,false),
 ('mwanafunzi','Mwanafunzi',160,false),
 ('nyingine','Kazi nyingine',170,true);

create table public.resident_occupations (
 resident_id uuid not null references public.residents on delete cascade,
 occupation_code text not null references public.occupations(code),
 detail text check(detail is null or length(trim(detail)) between 2 and 120),
 primary key(resident_id,occupation_code)
);
create index resident_occupations_code on public.resident_occupations(occupation_code,resident_id);

alter table public.occupations enable row level security;
alter table public.resident_occupations enable row level security;
revoke all on public.occupations,public.resident_occupations from anon,authenticated;
grant select on public.occupations,public.resident_occupations to authenticated;
grant all on public.occupations,public.resident_occupations to service_role;
create policy read_occupations on public.occupations for select to authenticated using(private.is_active_admin());
create policy read_resident_occupations on public.resident_occupations for select to authenticated
 using(exists(select 1 from public.residents r where r.id=resident_id and private.is_mtaa_admin(r.mtaa_id)));

create function private.replace_resident_occupations(p_resident uuid,p_codes text[],p_other text default null)
returns void language plpgsql security definer set search_path='' as $$
declare codes text[]; other_detail text:=nullif(trim(coalesce(p_other,'')),'');
begin
 -- A null value means a legacy caller omitted the newly added optional
 -- parameter. It preserves compatibility during a rolling deployment.
 if p_codes is null then return; end if;
 if cardinality(p_codes) not between 1 and 3 then raise exception 'Select one to three occupations'; end if;
 select array_agg(distinct submitted.code) into codes from unnest(p_codes) as submitted(code);
 if cardinality(codes)<>cardinality(p_codes) then raise exception 'Duplicate occupation'; end if;
 if exists(select 1 from unnest(codes) as submitted(code) where not exists(
  select 1 from public.occupations o where o.code=submitted.code and o.status='active'
 )) then raise exception 'Invalid occupation'; end if;
 if 'nyingine'=any(codes) and (other_detail is null or length(other_detail) not between 2 and 120) then
  raise exception 'Describe the other occupation';
 end if;
 if not ('nyingine'=any(codes)) and other_detail is not null then raise exception 'Unexpected occupation detail'; end if;
 delete from public.resident_occupations where resident_id=p_resident;
 insert into public.resident_occupations(resident_id,occupation_code,detail)
 select p_resident,submitted.code,case when submitted.code='nyingine' then other_detail end from unnest(codes) as submitted(code);
end $$;

-- Existing calls remain valid because the new parameters have defaults. New
-- clients pass them explicitly and receive database-level validation.
drop function public.save_resident(uuid,uuid,uuid,text,text,uuid[],boolean,boolean,uuid,uuid[]);
create function public.save_resident(p_actor uuid,p_mtaa uuid,p_balozi uuid,p_name text,p_phone text,
 p_categories uuid[],p_approved boolean,p_consent boolean,p_id uuid default null,p_groups uuid[] default '{}',
 p_occupations text[] default null,p_occupation_other text default null)
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
 perform private.replace_resident_occupations(rid,p_occupations,p_occupation_other);
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id) values(p_actor,case when p_id is null then 'resident.created' else 'resident.updated' end,'resident',rid,p_mtaa);
 return rid;
end $$;

drop function public.register_public_resident(text,text,uuid,uuid,text,text,uuid[],boolean,text,uuid[]);
create function public.register_public_resident(p_token text,p_request text,p_mtaa uuid,p_balozi uuid,p_name text,p_phone text,
 p_categories uuid[],p_consent boolean,p_provider text,p_groups uuid[] default '{}',p_occupations text[] default null,
 p_occupation_other text default null)
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
 if p_consent is distinct from true or p_provider is null or p_provider not in ('pending','mock','clickpesa') then raise exception 'Invalid registration'; end if;
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
 perform private.replace_resident_occupations(rid,p_occupations,p_occupation_other);
 insert into public.payments(resident_id,mtaa_id,provider,idempotency_key,amount,currency)
 values(rid,p_mtaa,p_provider,gen_random_uuid(),3000,'TZS') returning id into pid;
 insert into private.registration_sessions(token_hash,request_hash,resident_id,payment_id) values(p_token,p_request,rid,pid);
 insert into public.audit_logs(action,entity_type,entity_id,mtaa_id,metadata)
 values('resident.self_registered','resident',rid,p_mtaa,jsonb_build_object('payment_id',pid,'consent_version','2026-09-public-v1'));
 return pid;
end $$;

drop function public.register_agent_resident(uuid,uuid,uuid,text,text,uuid[],boolean,text,uuid,uuid[]);
create function public.register_agent_resident(p_actor uuid,p_mtaa uuid,p_balozi uuid,p_name text,p_phone text,
 p_categories uuid[],p_consent boolean,p_provider text,p_key uuid,p_groups uuid[] default '{}',
 p_occupations text[] default null,p_occupation_other text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rid uuid; pid uuid; groups uuid[]; old_payment public.payments;
begin
 perform private.require_agent(p_actor,p_mtaa);
 select * into old_payment from public.payments where idempotency_key=p_key;
 if found then
  if old_payment.agent_id<>p_actor or old_payment.mtaa_id<>p_mtaa or old_payment.provider<>p_provider then raise exception 'Idempotency conflict'; end if;
  return jsonb_build_object('resident_id',old_payment.resident_id,'payment_id',old_payment.id);
 end if;
 if p_consent is distinct from true or p_provider not in ('pending','mock','clickpesa') then raise exception 'Invalid registration'; end if;
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
 perform private.replace_resident_occupations(rid,p_occupations,p_occupation_other);
 insert into public.payments(resident_id,mtaa_id,provider,idempotency_key,agent_id) values(rid,p_mtaa,p_provider,p_key,p_actor) returning id into pid;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id,metadata)
 values(p_actor,'agent.registration','resident',rid,p_mtaa,jsonb_build_object('payment_id',pid));
 return jsonb_build_object('resident_id',rid,'payment_id',pid);
end $$;

create or replace view public.resident_directory with(security_invoker=true) as
select r.*,coalesce(b.name,'') as balozi_name,m.name as mtaa_name,
 coalesce((select array_agg(rc.category_id) from public.resident_categories rc where rc.resident_id=r.id),'{}'::uuid[]) category_ids,
 coalesce((select string_agg(c.name,', ' order by c.name) from public.resident_categories rc join public.categories c on c.id=rc.category_id where rc.resident_id=r.id),'') category_names,
 (select max(s.expires_at) from public.subscriptions s where s.resident_id=r.id and s.status in ('active','expired')) expires_at,
 case when exists(select 1 from public.subscriptions s where s.resident_id=r.id and s.status='active' and s.starts_at<=now() and s.expires_at>now()) then 'active'
 when exists(select 1 from public.subscriptions s where s.resident_id=r.id and s.status in ('active','expired') and s.expires_at<=now()) then 'expired' else 'pending' end subscription_status,
 coalesce((select array_agg(rg.value_id) from public.resident_groups rg where rg.resident_id=r.id),'{}'::uuid[]) group_value_ids,
 coalesce((select string_agg(f.name||': '||v.name,', ' order by f.name) from public.resident_groups rg join public.grouping_values v on v.id=rg.value_id join public.grouping_fields f on f.id=rg.field_id where rg.resident_id=r.id),'') group_names,
 coalesce(b.name,'') as balozi_area_name,coalesce(b.balozi_name,'') as balozi_leader_name,
 w.name as ward_name,d.name as district_name,region.name as region_name,
 coalesce((select array_agg(ro.occupation_code order by o.sort_order) from public.resident_occupations ro join public.occupations o on o.code=ro.occupation_code where ro.resident_id=r.id),'{}'::text[]) occupation_codes,
 coalesce((select string_agg(case when ro.detail is null then o.name else o.name||': '||ro.detail end,', ' order by o.sort_order) from public.resident_occupations ro join public.occupations o on o.code=ro.occupation_code where ro.resident_id=r.id),'') occupation_names,
 coalesce((select max(ro.detail) from public.resident_occupations ro where ro.resident_id=r.id and ro.occupation_code='nyingine'),'') occupation_other
from public.residents r
left join public.balozi_areas b on b.id=r.balozi_area_id
join public.mitaa m on m.id=r.mtaa_id
join public.wards w on w.id=m.ward_id
join public.districts d on d.id=w.district_id
join public.regions region on region.id=d.region_id;

revoke all on function private.replace_resident_occupations(uuid,text[],text) from public,anon,authenticated;
revoke all on function public.save_resident(uuid,uuid,uuid,text,text,uuid[],boolean,boolean,uuid,uuid[],text[],text),
 public.register_public_resident(text,text,uuid,uuid,text,text,uuid[],boolean,text,uuid[],text[],text),
 public.register_agent_resident(uuid,uuid,uuid,text,text,uuid[],boolean,text,uuid,uuid[],text[],text) from public,anon,authenticated;
grant execute on function public.save_resident(uuid,uuid,uuid,text,text,uuid[],boolean,boolean,uuid,uuid[],text[],text),
 public.register_public_resident(text,text,uuid,uuid,text,text,uuid[],boolean,text,uuid[],text[],text),
 public.register_agent_resident(uuid,uuid,uuid,text,text,uuid[],boolean,text,uuid,uuid[],text[],text) to service_role;
grant select on public.resident_directory to authenticated,service_role;
