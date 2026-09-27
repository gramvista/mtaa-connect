-- Provenance for reviewed administrative datasets; no tenant policy is weakened.
create table public.location_datasets (
 id text primary key,
 title text not null,
 publisher text not null,
 source_url text not null,
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 reference_year integer not null,
 retrieved_at date not null,
 notes text not null,
 counts jsonb not null,
 imported_at timestamptz not null default now()
);
alter table public.location_datasets enable row level security;
revoke all on public.location_datasets from anon,authenticated;
grant select on public.location_datasets to authenticated;
grant all on public.location_datasets to service_role;
create policy active_admin_read on public.location_datasets for select to authenticated using(private.is_active_admin());

alter table public.regions
 add column source_dataset text references public.location_datasets(id),
 add column source_key text,
 add column official_name text,
 add column source_metadata jsonb not null default '{}',
 add constraint regions_source_unique unique(source_dataset,source_key),
 add constraint regions_source_pair check((source_dataset is null)=(source_key is null));
alter table public.districts
 add column source_dataset text references public.location_datasets(id),
 add column source_key text,
 add column official_name text,
 add column source_metadata jsonb not null default '{}',
 add constraint districts_source_unique unique(source_dataset,source_key),
 add constraint districts_source_pair check((source_dataset is null)=(source_key is null));
alter table public.wards
 add column source_dataset text references public.location_datasets(id),
 add column source_key text,
 add column official_name text,
 add column source_metadata jsonb not null default '{}',
 add constraint wards_source_unique unique(source_dataset,source_key),
 add constraint wards_source_pair check((source_dataset is null)=(source_key is null));
