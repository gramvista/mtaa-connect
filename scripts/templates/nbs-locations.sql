-- Generated from the official NBS 2022 PHC ward attribute file. See docs/location-data.md.
-- Source ZIP SHA256: a81eecf5021d1904d2d57a3c5ea40b8c3f538cd5b227e8d68a302653a6d1466e
-- No resident data, invented wards, or council-to-district substitutions.
insert into public.location_datasets(id,title,publisher,source_url,source_sha256,reference_year,retrieved_at,notes,counts)
values('nbs-2022-wards-2024','Tanzania 2022 Population and Housing Census wards/shehia (published 2024)',
 'National Bureau of Statistics, Tanzania',
 'https://www.nbs.go.tz/uploads/statistics/documents/en-1714652282-TANZANIA_2022PHC_WARD_SHAPEFILES.zip',
 'a81eecf5021d1904d2d57a3c5ea40b8c3f538cd5b227e8d68a302653a6d1466e',2022,current_date,
 'Census snapshot, not verified as a complete 2026 gazette. Districts use dist_code/dist_name, not councils. Zanzibar shehia are represented at ward level. Three same-district duplicate-name pairs are qualified by council; original names and all five reused-code pairs are retained.',
 '{"regions":31,"districts":150,"councils":195,"wards_shehia":4344}')
on conflict(id) do nothing;

create temporary table nbs2022_import as
select * from jsonb_to_recordset($nbs2022$__DATASET_ROWS__$nbs2022$::jsonb)
as x("OBJECTID_1" text,reg_code text,reg_name text,dist_code text,dist_name text,counc_code text,counc_name text,ward_code text,ward_name text,display_name text);

insert into public.regions(name,source_dataset,source_key,official_name,source_metadata)
select distinct reg_name,'nbs-2022-wards-2024',reg_code,reg_name,jsonb_build_object('region_code',reg_code)
from nbs2022_import
on conflict(name) do update set source_dataset=excluded.source_dataset,source_key=excluded.source_key,official_name=excluded.official_name,source_metadata=excluded.source_metadata
where public.regions.source_dataset is null or public.regions.source_dataset=excluded.source_dataset;

insert into public.districts(region_id,name,source_dataset,source_key,official_name,source_metadata)
select distinct r.id,x.dist_name,'nbs-2022-wards-2024',x.reg_code||':'||x.dist_code,x.dist_name,
jsonb_build_object('region_code',x.reg_code,'district_code',x.dist_code)
from nbs2022_import x join public.regions r on r.source_dataset='nbs-2022-wards-2024' and r.source_key=x.reg_code
on conflict(region_id,name) do update set source_dataset=excluded.source_dataset,source_key=excluded.source_key,official_name=excluded.official_name,source_metadata=excluded.source_metadata
where public.districts.source_dataset is null or public.districts.source_dataset=excluded.source_dataset;

insert into public.wards(district_id,name,source_dataset,source_key,official_name,source_metadata)
select d.id,x.display_name,'nbs-2022-wards-2024',x."OBJECTID_1",x.ward_name,
jsonb_build_object('region_code',x.reg_code,'district_code',x.dist_code,'council_code',x.counc_code,'council_name',x.counc_name,'ward_code',x.ward_code)
from nbs2022_import x join public.districts d on d.source_dataset='nbs-2022-wards-2024' and d.source_key=x.reg_code||':'||x.dist_code
on conflict(district_id,name) do update set source_dataset=excluded.source_dataset,source_key=excluded.source_key,official_name=excluded.official_name,source_metadata=excluded.source_metadata
where public.wards.source_dataset is null or public.wards.source_dataset=excluded.source_dataset;

do $$ begin
 if (select count(*) from public.regions where source_dataset='nbs-2022-wards-2024')<>31
 or (select count(*) from public.districts where source_dataset='nbs-2022-wards-2024')<>150
 or (select count(*) from public.wards where source_dataset='nbs-2022-wards-2024')<>4344
 then raise exception 'NBS import coverage mismatch; transaction rolled back'; end if;
end $$;
insert into public.audit_logs(action,entity_type,metadata)
select 'locations.imported','location_dataset',jsonb_build_object('dataset','nbs-2022-wards-2024','regions',31,'districts',150,'wards_shehia',4344)
where not exists(select 1 from public.audit_logs where action='locations.imported' and metadata->>'dataset'='nbs-2022-wards-2024');
drop table nbs2022_import;
