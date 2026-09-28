-- Personalize every non-welcome campaign at claim time so names and locations
-- always come from the current resident record, never from chairman-entered text.
create or replace function public.claim_sms(p_limit integer default 50)
returns table(id uuid,phone text,message text,mtaa_id uuid)
language plpgsql security definer set search_path='' as $$
begin
 if p_limit not between 1 and 100 then raise exception 'Invalid batch size'; end if;
 update public.sms_recipients set status='uncertain',error_message='Worker lease expired; reconcile with provider before retry'
 where status='processing' and claimed_at<now()-interval '10 minutes';
 update public.sms_recipients s set status='cancelled' where status='pending' and not private.eligible(s.resident_id)
 and exists(select 1 from public.sms_campaigns c where c.id=s.campaign_id and c.status in ('queued','processing'));
 return query with picked as (
  select s.id from public.sms_recipients s join public.sms_campaigns c on c.id=s.campaign_id
  where s.status='pending' and c.status in ('queued','processing') and private.eligible(s.resident_id)
  order by c.created_at,s.id for update of s skip locked limit p_limit
 ), claimed as (
  update public.sms_recipients s set status='processing',claimed_at=now(),attempts=attempts+1
  from picked where s.id=picked.id
  returning s.id,s.phone_number_snapshot,s.campaign_id,s.resident_id,s.mtaa_id
 )
 select claimed.id,claimed.phone_number_snapshot,
  case when c.target_type='welcome' then c.message
   else 'Habari '||split_part(trim(r.full_name),' ',1)||' wa mtaa '||m.name||', '||c.message end,
  claimed.mtaa_id
 from claimed
 join public.sms_campaigns c on c.id=claimed.campaign_id
 join public.residents r on r.id=claimed.resident_id
 join public.mitaa m on m.id=claimed.mtaa_id;
end $$;

revoke all on function public.claim_sms(integer) from public,anon,authenticated;
grant execute on function public.claim_sms(integer) to service_role;

