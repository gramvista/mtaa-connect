import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LocationPath } from '@/components/admin/location-picker';
export async function locationPath(db:SupabaseClient,mtaa:string|null,balozi:string|null=''):Promise<LocationPath> {
 const path={region:'',district:'',ward:'',mtaa:mtaa||'',balozi:balozi||''};
 if(!mtaa)return path;
 const {data:m,error}=await db.from('mitaa').select('ward_id').eq('id',mtaa).single();
 if(error||!m)throw new Error('Location not available');
 const {data:w}=await db.from('wards').select('district_id').eq('id',m.ward_id).single();
 const {data:d}=await db.from('districts').select('region_id').eq('id',w!.district_id).single();
 return {...path,ward:m.ward_id,district:w!.district_id,region:d!.region_id};
}
