import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/features/auth/context';
import { locationPath } from '@/features/residents/locations';

export async function GET(request:NextRequest) {
 const {db,profile}=await requireAdmin();
 const kind=z.enum(['regions','districts','wards','mitaa','balozi_areas','categories','grouping_fields','grouping_values']).safeParse(request.nextUrl.searchParams.get('kind'));
 const parent=request.nextUrl.searchParams.get('parent');
 const mapping={regions:null,districts:'region_id',wards:'district_id',mitaa:'ward_id',balozi_areas:'mtaa_id',categories:'mtaa_id',grouping_fields:'mtaa_id',grouping_values:'field_id'} as const;
 if(!kind.success) return Response.json({error:'Invalid kind'},{status:400});
 const table=kind.data;
 let query=db.from(table).select('*').order('name').limit(500);
 if(mapping[table]) {
  if(!z.uuid().safeParse(parent).success) return Response.json({rows:[]});
  if(table==='categories'||table==='grouping_fields') query=query.or(`mtaa_id.is.null,mtaa_id.eq.${parent}`);
  else query=query.eq(mapping[table]!,parent!);
 }
 if(['mitaa','balozi_areas','categories','grouping_fields','grouping_values'].includes(table)) query=query.eq('status','active');
 if(profile.role==='mtaa_admin'&&['regions','districts','wards','mitaa'].includes(table)){
  const path=await locationPath(db,profile.mtaa_id);
  const scoped={regions:path.region,districts:path.district,wards:path.ward,mitaa:path.mtaa};
  query=query.eq('id',scoped[table as keyof typeof scoped]);
 }
 const {data,error}=await query;
 if(error) return Response.json({error:'Query failed'},{status:503});
 return Response.json({rows:data},{headers:{'Cache-Control':'private, no-store'}});
}
