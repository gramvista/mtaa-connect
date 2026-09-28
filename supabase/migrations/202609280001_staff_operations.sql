alter table public.profiles add column if not exists email text;
do $$ begin
 if exists(select 1 from information_schema.columns where table_schema='auth' and table_name='users' and column_name='email') then
  execute 'update public.profiles p set email=lower(u.email) from auth.users u where u.id=p.id and p.email is null';
 end if;
end $$;
create unique index if not exists profiles_email_unique on public.profiles(lower(email)) where email is not null;

create table public.agent_mtaa_assignments (
 id uuid primary key default gen_random_uuid(),
 agent_id uuid not null references public.profiles(id) on delete restrict,
 mtaa_id uuid not null references public.mitaa(id) on delete restrict,
 status text not null default 'active' check(status in ('active','inactive')),
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(agent_id,mtaa_id)
);
insert into public.agent_mtaa_assignments(agent_id,mtaa_id)
select id,mtaa_id from public.profiles where role='agent' and mtaa_id is not null on conflict do nothing;
create index agent_mtaa_assignments_agent on public.agent_mtaa_assignments(agent_id,status);
alter table public.agent_mtaa_assignments enable row level security;
revoke all on public.agent_mtaa_assignments from public,anon,authenticated;
grant select on public.agent_mtaa_assignments to authenticated;
grant all on public.agent_mtaa_assignments to service_role;
create policy agent_read_assignments on public.agent_mtaa_assignments for select to authenticated using(agent_id=auth.uid());

create table public.agent_tasks (
 id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title)) between 2 and 160),
 description text not null default '', agent_id uuid not null references public.profiles(id) on delete restrict,
 status text not null default 'pending' check(status in ('pending','in_progress','completed','cancelled')),
 priority text not null default 'normal' check(priority in ('low','normal','high')),
 due_at timestamptz, assigned_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz
);
create table public.agent_task_mitaa (
 task_id uuid not null references public.agent_tasks(id) on delete cascade,
 mtaa_id uuid not null references public.mitaa(id) on delete restrict,
 primary key(task_id,mtaa_id)
);
create index agent_tasks_agent on public.agent_tasks(agent_id,status,created_at desc);
alter table public.agent_tasks enable row level security;
alter table public.agent_task_mitaa enable row level security;
revoke all on public.agent_tasks,public.agent_task_mitaa from public,anon,authenticated;
grant select on public.agent_tasks,public.agent_task_mitaa to authenticated;
grant all on public.agent_tasks,public.agent_task_mitaa to service_role;
create policy agent_read_tasks on public.agent_tasks for select to authenticated using(agent_id=auth.uid());
create policy agent_read_task_mitaa on public.agent_task_mitaa for select to authenticated using(exists(select 1 from public.agent_tasks t where t.id=task_id and t.agent_id=auth.uid()));

create or replace function private.require_agent(actor uuid,tenant uuid) returns public.profiles
language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
 select * into p from public.profiles where id=actor and role='agent' and status='active';
 if p.id is null or not (p.mtaa_id=tenant or exists(select 1 from public.agent_mtaa_assignments a join public.mitaa m on m.id=a.mtaa_id where a.agent_id=actor and a.mtaa_id=tenant and a.status='active' and m.status='active')) then raise exception 'Forbidden' using errcode='42501'; end if;
 return p;
end $$;

create function public.assign_agent_mtaa(p_actor uuid,p_agent uuid,p_mtaa uuid,p_active boolean default true) returns void
language plpgsql security definer set search_path='' as $$
declare a public.profiles; remaining uuid;
begin
 perform private.require_actor(p_actor,null,true);
 select * into a from public.profiles where id=p_agent and role='agent';
 if a.id is null or not exists(select 1 from public.mitaa where id=p_mtaa and status='active') then raise exception 'invalid assignment'; end if;
 if p_active then
  insert into public.agent_mtaa_assignments(agent_id,mtaa_id,status,created_by) values(p_agent,p_mtaa,'active',p_actor)
  on conflict(agent_id,mtaa_id) do update set status='active',updated_at=now();
  if a.mtaa_id is null then update public.profiles set mtaa_id=p_mtaa,updated_at=now() where id=p_agent; end if;
 else
  select mtaa_id into remaining from public.agent_mtaa_assignments where agent_id=p_agent and mtaa_id<>p_mtaa and status='active' limit 1;
  if remaining is null then raise exception 'agent needs one active mtaa'; end if;
  update public.agent_mtaa_assignments set status='inactive',updated_at=now() where agent_id=p_agent and mtaa_id=p_mtaa;
  if a.mtaa_id=p_mtaa then update public.profiles set mtaa_id=remaining,updated_at=now() where id=p_agent; end if;
 end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id,metadata) values(p_actor,case when p_active then 'agent.assignment.added' else 'agent.assignment.removed' end,'profile',p_agent,p_mtaa,jsonb_build_object('active',p_active));
end $$;

create function public.create_agent_task(p_actor uuid,p_agent uuid,p_title text,p_description text,p_priority text,p_due_at timestamptz,p_mitaa uuid[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare tid uuid; mid uuid;
begin
 perform private.require_actor(p_actor,null,true);
 if trim(p_title)='' or p_priority not in ('low','normal','high') or coalesce(array_length(p_mitaa,1),0)=0 then raise exception 'invalid task'; end if;
 foreach mid in array p_mitaa loop
  if not exists(select 1 from public.agent_mtaa_assignments where agent_id=p_agent and mtaa_id=mid and status='active') then raise exception 'unassigned mtaa'; end if;
 end loop;
 insert into public.agent_tasks(title,description,agent_id,priority,due_at,assigned_by) values(trim(p_title),coalesce(trim(p_description),''),p_agent,p_priority,p_due_at,p_actor) returning id into tid;
 insert into public.agent_task_mitaa(task_id,mtaa_id) select tid,unnest(p_mitaa);
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(p_actor,'agent.task.created','agent_task',tid,jsonb_build_object('agent_id',p_agent,'mitaa',p_mitaa));
 return tid;
end $$;

create function public.set_agent_task_status(p_actor uuid,p_task uuid,p_status text) returns void
language plpgsql security definer set search_path='' as $$
declare task public.agent_tasks; actor public.profiles;
begin
 select * into actor from public.profiles where id=p_actor and status='active'; select * into task from public.agent_tasks where id=p_task for update;
 if task.id is null or p_status not in ('pending','in_progress','completed','cancelled') then raise exception 'invalid task'; end if;
 if actor.role='agent' then
  if task.agent_id<>p_actor or not ((task.status='pending' and p_status='in_progress') or (task.status='in_progress' and p_status='completed')) then raise exception 'forbidden' using errcode='42501'; end if;
 elsif actor.role<>'super_admin' then raise exception 'forbidden' using errcode='42501'; end if;
 update public.agent_tasks set status=p_status,updated_at=now(),completed_at=case when p_status='completed' then now() else null end where id=p_task;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(p_actor,'agent.task.status','agent_task',p_task,jsonb_build_object('status',p_status));
end $$;

create function public.mark_agent_commission_paid(p_actor uuid,p_commission uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c public.agent_commissions;
begin
 perform private.require_actor(p_actor,null,true);
 update public.agent_commissions set status='paid',paid_at=now() where id=p_commission and status='earned' returning * into c;
 if c.id is null then raise exception 'commission not payable'; end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id,metadata) values(p_actor,'agent.commission.paid','agent_commission',c.id,c.mtaa_id,jsonb_build_object('amount',c.amount,'agent_id',c.agent_id));
end $$;

revoke all on function public.assign_agent_mtaa(uuid,uuid,uuid,boolean),public.create_agent_task(uuid,uuid,text,text,text,timestamptz,uuid[]),public.set_agent_task_status(uuid,uuid,text),public.mark_agent_commission_paid(uuid,uuid) from public,anon,authenticated;
grant execute on function public.assign_agent_mtaa(uuid,uuid,uuid,boolean),public.create_agent_task(uuid,uuid,text,text,text,timestamptz,uuid[]),public.set_agent_task_status(uuid,uuid,text),public.mark_agent_commission_paid(uuid,uuid) to service_role;
