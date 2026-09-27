-- A phone number is the payment/contact destination, not a unique resident ID.
-- Different residents may share a household phone, and names are never unique.
alter table public.residents
 drop constraint if exists residents_mtaa_id_phone_number_key;

create index if not exists residents_mtaa_phone
 on public.residents(mtaa_id,phone_number);
