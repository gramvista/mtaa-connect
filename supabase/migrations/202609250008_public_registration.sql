-- Anonymous browsers cannot access these sessions or execute these RPCs.
-- The Next.js public boundary validates input, rate limits, and keeps the
-- random receipt capability in an HttpOnly cookie (only its SHA-256 is stored).
create table private.registration_sessions (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
 resident_id uuid not null references public.residents,
 payment_id uuid not null references public.payments,
 expires_at timestamptz not null default now()+interval '7 days',
 created_at timestamptz not null default now()
);
alter table private.registration_sessions enable row level security;
revoke all on private.registration_sessions from public,anon,authenticated;
create index registration_sessions_expiry on private.registration_sessions(expires_at);

create function public.register_public_resident(p_token text,p_request text,p_mtaa uuid,p_balozi uuid,p_name text,p_phone text,p_categories uuid[],p_consent boolean,p_provider text)
returns uuid language plpgsql security definer set search_path='' as $$
declare old_session private.registration_sessions; rid uuid; pid uuid;
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
 if not exists(select 1 from public.balozi_areas b join public.mitaa m on m.id=b.mtaa_id where b.id=p_balozi and b.mtaa_id=p_mtaa and b.status='active' and m.status='active') then raise exception 'Invalid area'; end if;
 -- Never infer approval, payment or identity verification from public input.
 insert into public.residents(mtaa_id,balozi_area_id,full_name,phone_number,consent_at,consent_version,registration_status)
 values(p_mtaa,p_balozi,trim(p_name),p_phone,now(),'2026-09-public-v1','pending') returning id into rid;
 insert into public.resident_categories(resident_id,category_id) select rid,unnest(p_categories);
 insert into public.payments(resident_id,mtaa_id,provider,idempotency_key,amount,currency)
 values(rid,p_mtaa,p_provider,gen_random_uuid(),3000,'TZS') returning id into pid;
 insert into private.registration_sessions(token_hash,request_hash,resident_id,payment_id) values(p_token,p_request,rid,pid);
 insert into public.audit_logs(action,entity_type,entity_id,mtaa_id,metadata)
 values('resident.self_registered','resident',rid,p_mtaa,jsonb_build_object('payment_id',pid,'consent_version','2026-09-public-v1'));
 return pid;
end $$;

-- Only the trusted server can resolve a receipt. No lookup by phone/ID is public.
create function public.public_registration_receipt(p_token text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('payment_id',p.id,'resident_id',r.id,'phone',r.phone_number,
  'provider',p.provider,'idempotency_key',p.idempotency_key,'payment_status',p.status,
  'registration_status',r.registration_status,'mtaa',m.name,'amount',p.amount,'currency',p.currency,
  'expires_at',sub.expires_at)
 from private.registration_sessions s join public.residents r on r.id=s.resident_id
 join public.payments p on p.id=s.payment_id join public.mitaa m on m.id=r.mtaa_id
 left join public.subscriptions sub on sub.id=p.subscription_id
 where s.token_hash=p_token and s.expires_at>now()
$$;
revoke all on function public.register_public_resident(text,text,uuid,uuid,text,text,uuid[],boolean,text),public.public_registration_receipt(text) from public,anon,authenticated;
grant execute on function public.register_public_resident(text,text,uuid,uuid,text,text,uuid[],boolean,text),public.public_registration_receipt(text) to service_role;
