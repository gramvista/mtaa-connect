-- Apply the same access rule to residents created by an active Super Admin
-- before the automatic grant trigger was installed.
do $$
declare item record;
begin
 for item in
  select r.id resident_id,r.created_by actor_id
  from public.residents r
  join public.profiles p on p.id=r.created_by
  where p.role='super_admin' and p.status='active'
    and not exists(
     select 1 from public.subscriptions s
     where s.resident_id=r.id and s.status='active' and s.starts_at<=now() and s.expires_at>now()
    )
 loop
  perform private.grant_resident_access(item.actor_id,item.resident_id,'backfill_super_admin_creation');
 end loop;
end $$;
