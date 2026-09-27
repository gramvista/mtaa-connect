-- The resident contact and the mobile-money payer may be different people.
alter table public.payments
 add column if not exists payer_phone text
 check(payer_phone is null or payer_phone ~ '^\+255[67][0-9]{8}$');

create index if not exists payments_payer_phone
 on public.payments(payer_phone,created_at desc)
 where payer_phone is not null;
