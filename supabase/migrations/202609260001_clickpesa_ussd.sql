-- ClickPesa USSD-PUSH integration. Provider order references are limited to
-- 20 alphanumeric characters, so every attempt is durably mapped to our UUID.
create table private.payment_attempts (
 payment_id uuid not null references public.payments(id) on delete cascade,
 provider text not null,
 attempt_number smallint not null check(attempt_number between 1 and 99),
 order_reference text not null check(order_reference ~ '^[A-Za-z0-9]{1,20}$'),
 provider_transaction_id text check(provider_transaction_id is null or length(provider_transaction_id) between 1 and 200),
 status text not null default 'created' check(status in ('created','processing','failed','successful')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(payment_id,provider,attempt_number),
 unique(provider,order_reference)
);
revoke all on private.payment_attempts from public,anon,authenticated;

create function public.prepare_payment_attempt(p_payment uuid,p_provider text) returns text
language plpgsql security definer set search_path='' as $$
declare p public.payments; previous private.payment_attempts; next_number integer; order_ref text;
begin
 select * into p from public.payments where id=p_payment for update;
 if p.id is null or p.provider<>p_provider or p.status<>'pending' or p_provider<>'clickpesa' then raise exception 'Invalid payment attempt'; end if;
 select * into previous from private.payment_attempts where payment_id=p_payment and provider=p_provider order by attempt_number desc limit 1;
 if found and previous.status in ('created','processing','successful') then return previous.order_reference; end if;
 next_number:=coalesce(previous.attempt_number,0)+1;
 if next_number>99 then raise exception 'Payment retry limit reached'; end if;
 order_ref:='MC'||upper(substr(replace(p_payment::text,'-',''),1,16))||lpad(next_number::text,2,'0');
 insert into private.payment_attempts(payment_id,provider,attempt_number,order_reference)
 values(p_payment,p_provider,next_number,order_ref);
 return order_ref;
end $$;

create function public.record_payment_attempt(p_payment uuid,p_provider text,p_order_reference text,p_transaction_id text,p_status text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_provider<>'clickpesa' or p_status not in ('processing','failed','successful') or p_order_reference !~ '^[A-Za-z0-9]{1,20}$' or
    (p_transaction_id is not null and length(p_transaction_id) not between 1 and 200) then raise exception 'Invalid payment attempt update'; end if;
 update private.payment_attempts a set provider_transaction_id=coalesce(a.provider_transaction_id,p_transaction_id),
 status=case when a.status='successful' then 'successful' else p_status end,updated_at=now()
 from public.payments p where a.payment_id=p_payment and a.provider=p_provider and a.order_reference=p_order_reference
 and p.id=a.payment_id and p.provider=a.provider
 and (a.provider_transaction_id is null or p_transaction_id is null or a.provider_transaction_id=p_transaction_id);
 if not found then raise exception 'Payment attempt not found'; end if;
end $$;

create function public.payment_for_order_reference(p_provider text,p_order_reference text) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare result uuid;
begin
 if p_provider<>'clickpesa' then raise exception 'Payment attempt not found'; end if;
 select payment_id into result from private.payment_attempts where provider=p_provider and order_reference=p_order_reference;
 if result is null then raise exception 'Payment attempt not found'; end if;
 return result;
end $$;

-- Preserve the existing payment boundary while allowing the documented provider.
create or replace function public.create_payment(p_actor uuid,p_resident uuid,p_provider text,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare tenant uuid; pid uuid; old_payment public.payments;
begin
 select mtaa_id into tenant from public.residents where id=p_resident;
 if tenant is null then raise exception 'Resident not found'; end if;
 perform private.require_actor(p_actor,tenant);
 if p_provider not in ('mock','pending','clickpesa') then raise exception 'Provider not implemented'; end if;
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

create or replace function public.register_public_resident(p_token text,p_request text,p_mtaa uuid,p_balozi uuid,p_name text,p_phone text,p_categories uuid[],p_consent boolean,p_provider text,p_groups uuid[] default '{}')
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
 insert into public.payments(resident_id,mtaa_id,provider,idempotency_key,amount,currency)
 values(rid,p_mtaa,p_provider,gen_random_uuid(),3000,'TZS') returning id into pid;
 insert into private.registration_sessions(token_hash,request_hash,resident_id,payment_id) values(p_token,p_request,rid,pid);
 insert into public.audit_logs(action,entity_type,entity_id,mtaa_id,metadata)
 values('resident.self_registered','resident',rid,p_mtaa,jsonb_build_object('payment_id',pid,'consent_version','2026-09-public-v1'));
 return pid;
end $$;

create or replace function public.register_agent_resident(p_actor uuid,p_mtaa uuid,p_balozi uuid,p_name text,p_phone text,
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
 insert into public.payments(resident_id,mtaa_id,provider,idempotency_key,agent_id) values(rid,p_mtaa,p_provider,p_key,p_actor) returning id into pid;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,mtaa_id,metadata)
 values(p_actor,'agent.registration','resident',rid,p_mtaa,jsonb_build_object('payment_id',pid));
 return jsonb_build_object('resident_id',rid,'payment_id',pid);
end $$;

revoke all on function public.prepare_payment_attempt(uuid,text),public.record_payment_attempt(uuid,text,text,text,text),public.payment_for_order_reference(text,text) from public,anon,authenticated;
grant execute on function public.prepare_payment_attempt(uuid,text),public.record_payment_attempt(uuid,text,text,text,text),public.payment_for_order_reference(text,text) to service_role;
