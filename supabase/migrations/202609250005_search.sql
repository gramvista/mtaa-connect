create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create index residents_name_search on public.residents using gin(full_name extensions.gin_trgm_ops);
create index residents_phone_search on public.residents using gin(phone_number extensions.gin_trgm_ops);
