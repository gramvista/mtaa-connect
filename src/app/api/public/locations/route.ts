import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

// Curated public directory, not a public grant on the underlying tables.
export async function GET(request:NextRequest){
 const parsed=z.enum(['regions','districts','wards','mitaa','balozi_areas','categories','grouping_fields','grouping_values','grouping_bundle']).safeParse(request.nextUrl.searchParams.get('kind'));
 if(!parsed.success)return Response.json({error:'Invalid kind'},{status:400});
 const kind=parsed.data,parent=request.nextUrl.searchParams.get('parent');
 const scope=request.nextUrl.searchParams.get('scope');
 if(kind!=='regions'&&!z.uuid().safeParse(parent).success)return Response.json({error:'Invalid parent'},{status:400});
 try{
  const db=createAdminClient();
  if(kind==='balozi_areas'||kind==='categories'||kind==='grouping_fields'||kind==='grouping_bundle'){
   const {data,error}=await db.from('mitaa').select('id').eq('id',parent!).eq('status','active').maybeSingle();
   if(error)throw new Error('Lookup failed');
   if(!data)return Response.json({rows:[]});
  }
  if(kind==='grouping_bundle'){
   const {data:fields,error:fieldError}=await db.from('grouping_fields').select('id,mtaa_id,name,status').or(`mtaa_id.is.null,mtaa_id.eq.${parent}`).eq('status','active').order('name').limit(100);
   if(fieldError)throw new Error('Lookup failed');
   const ids=(fields||[]).map(field=>field.id);
   const {data:values,error:valueError}=ids.length?await db.from('grouping_values').select('id,field_id,name,status').in('field_id',ids).eq('status','active').order('name').limit(1000):{data:[],error:null};
   if(valueError)throw new Error('Lookup failed');
   return Response.json({fields:fields||[],values:values||[]},{headers:{'Cache-Control':'public, max-age=30, s-maxage=60'}});
  }
  if(kind==='grouping_values'){
   if(!z.uuid().safeParse(scope).success)return Response.json({error:'Invalid scope'},{status:400});
   const {data,error}=await db.from('grouping_fields').select('id').eq('id',parent!).eq('status','active').or(`mtaa_id.is.null,mtaa_id.eq.${scope}`).maybeSingle();
   if(error)throw new Error('Lookup failed');
   if(!data)return Response.json({rows:[]});
  }
  let query=db.from(kind).select(kind==='balozi_areas'?'id,name,balozi_name':'id,name').order('name').order('id').limit(kind==='grouping_fields'?100:500);
  if(kind==='districts')query=query.eq('region_id',parent!);
  if(kind==='wards')query=query.eq('district_id',parent!);
  if(kind==='mitaa')query=query.eq('ward_id',parent!).eq('status','active');
  if(kind==='balozi_areas')query=query.eq('mtaa_id',parent!).eq('status','active');
  if(kind==='categories')query=query.or(`mtaa_id.is.null,mtaa_id.eq.${parent}`).eq('status','active');
  if(kind==='grouping_fields')query=query.or(`mtaa_id.is.null,mtaa_id.eq.${parent}`).eq('status','active');
  if(kind==='grouping_values')query=query.eq('field_id',parent!).eq('status','active');
  const {data,error}=await query;
  if(error)throw new Error('Lookup failed');
  return Response.json({rows:data},{headers:{'Cache-Control':'public, max-age=30, s-maxage=60'}});
 }catch{return Response.json({error:'Directory unavailable'},{status:503});}
}
