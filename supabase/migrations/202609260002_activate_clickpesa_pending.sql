-- The operator explicitly activated ClickPesa after registrations had already
-- been saved with the placeholder provider. Convert only untouched requests;
-- anything charged, settled, cancelled, failed, or provider-referenced stays unchanged.
with converted as (
 update public.payments
 set provider='clickpesa'
 where provider='pending' and status='pending' and provider_reference is null
 and subscription_id is null and paid_at is null
 returning id,mtaa_id
)
insert into public.audit_logs(action,entity_type,entity_id,mtaa_id,metadata)
select 'payment.provider_activated','payment',id,mtaa_id,jsonb_build_object('from','pending','to','clickpesa')
from converted;
