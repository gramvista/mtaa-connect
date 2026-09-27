import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/features/auth/context';
import { getPage } from '@/components/admin/table';
export async function GET(request:NextRequest){
 const {db}=await requireAdmin();const params=request.nextUrl.searchParams;
 const tenant=z.uuid().safeParse(params.get('mtaa'));if(!tenant.success)return Response.json({rows:[],count:0});
 const page=getPage(params.get('page')||'1');
 const q=(params.get('q')||'').replace(/[^\p{L}\p{N}+\s-]/gu,'').trim().slice(0,80);
 let query=db.from('resident_directory').select('id,full_name,phone_number',{count:'exact'}).eq('mtaa_id',tenant.data).eq('status','active').eq('registration_status','approved').eq('subscription_status','active').order('full_name').order('id').range((page-1)*25,page*25-1);
 if(q)query=query.or(`full_name.ilike.%${q}%,phone_number.ilike.%${q}%`);
 const {data,error,count}=await query;
 return Response.json(error?{error:'Query failed'}:{rows:data,count},{status:error?503:200,headers:{'Cache-Control':'private, no-store'}});
}
