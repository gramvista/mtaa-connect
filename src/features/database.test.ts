import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

let db: PGlite;
const admin = '10000000-0000-0000-0000-000000000001';
const leader = '10000000-0000-0000-0000-000000000002';
const other = '10000000-0000-0000-0000-000000000003';
const agent = '10000000-0000-0000-0000-000000000004';
let mtaa: string, mtaa2: string, balozi: string, balozi2: string, secondArea: string;
let resident: string, unpaid: string, otherResident: string;
let categories: string[];
async function scalar(sql: string, params: unknown[] = []) {
  const result = await db.query<Record<string, unknown>>(sql, params);
  return Object.values(result.rows[0])[0] as string;
}
async function asUser(id: string, sql: string) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${id}';`);
  try { return await db.query(sql); } finally { await db.exec('reset role;'); }
}
beforeAll(async () => {
  db = new PGlite({extensions:{pg_trgm}});
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  for (const file of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  await db.exec(`insert into auth.users values('${admin}'),('${leader}'),('${other}'),('${agent}');
    insert into public.profiles(id,full_name,role) values('${admin}','Platform Admin','super_admin');`);
  const region = await scalar("select public.save_location($1,'regions','Test Region')", [admin]);
  const district = await scalar("select public.save_location($1,'districts','Test District',$2)", [admin, region]);
  const ward = await scalar("select public.save_location($1,'wards','Test Ward',$2)", [admin, district]);
  mtaa = await scalar("select public.save_location($1,'mitaa','Test Mtaa A',$2)", [admin, ward]);
  mtaa2 = await scalar("select public.save_location($1,'mitaa','Test Mtaa B',$2)", [admin, ward]);
  balozi = await scalar("select public.save_location($1,'balozi_areas','Area A',$2)", [admin, mtaa]);
  secondArea = await scalar("select public.save_location($1,'balozi_areas','Area A2',$2)", [admin, mtaa]);
  balozi2 = await scalar("select public.save_location($1,'balozi_areas','Area B',$2)", [admin, mtaa2]);
  await db.query('select public.manage_profile($1,$2,$3,$4)', [admin, leader, 'Leader A', mtaa]);
  await db.query('select public.manage_profile($1,$2,$3,$4)', [admin, other, 'Leader B', mtaa2]);
  await db.query("select public.manage_profile($1,$2,$3,$4,'active','agent')", [admin, agent, 'Agent A', mtaa]);
  categories = (await db.query<{id:string}>('select id from public.categories order by name')).rows.map(r => r.id);
  resident = await scalar('select public.save_resident($1,$2,$3,$4,$5,$6,true,true)', [leader, mtaa, balozi, 'Resident One', '+255712345678', categories.slice(0,2)]);
  unpaid = await scalar('select public.save_resident($1,$2,$3,$4,$5,$6,true,true)', [leader, mtaa, secondArea, 'Unpaid Resident', '+255712345679', [categories[2]]]);
  otherResident = await scalar('select public.save_resident($1,$2,$3,$4,$5,$6,true,true)', [admin, mtaa2, balozi2, 'Other Tenant', '+255712345680', [categories[0]]]);
}, 60000);
afterAll(async () => { await db?.close(); });

describe('PostgreSQL migrations and security', () => {
  it('creates Mtaa administrators and agents only through the Super Admin boundary',async()=>{
    expect(await scalar('select role from public.profiles where id=$1',[leader])).toBe('mtaa_admin');
    expect(await scalar('select role from public.profiles where id=$1',[agent])).toBe('agent');
    expect(await scalar('select mtaa_id from public.profiles where id=$1',[agent])).toBe(mtaa);
    await expect(db.query("select public.manage_profile($1,$2,'Escalated',$3,'active','agent')",[leader,agent,mtaa])).rejects.toThrow('Forbidden');
    await expect(db.query("select public.manage_profile($1,$2,'Bad role',$3,'active','super_admin')",[admin,agent,mtaa])).rejects.toThrow('Invalid staff profile');
  });
  it('restricts agents to pending registrations in their assigned Mtaa',async()=>{
    await expect(db.query("select public.save_location($1,'balozi_areas','Agent Area',$2)",[agent,mtaa])).rejects.toThrow('Forbidden');
    await expect(db.query('select public.save_resident($1,$2,$3,$4,$5,$6,true,true)',[agent,mtaa,balozi,'Agent Approved','+255712345690',[categories[0]]])).rejects.toThrow('Forbidden');
    await expect(db.query("select public.register_agent_resident($1,$2,$3,$4,$5,$6,true,'mock',$7)",[agent,mtaa2,balozi2,'Wrong Tenant','+255712345690',[categories[0]],'10000000-0000-4000-8000-000000000099'])).rejects.toThrow('Forbidden');
    expect((await asUser(agent,'select id from public.residents')).rows).toHaveLength(0);
  });
  it('credits exactly TSh 300 after one verified TSh 3,000 agent registration',async()=>{
    await db.exec('begin');
    try{
      const key='10000000-0000-4000-8000-000000000098';
      const call="select public.register_agent_resident($1,$2,$3,$4,$5,$6,true,'mock',$7)";
      const first=await scalar(call,[agent,mtaa,null,'Agent Resident','+255712345690',[categories[0]],key]) as unknown as {resident_id:string;payment_id:string};
      const replay=await scalar(call,[agent,mtaa,null,'Agent Resident','+255712345690',[categories[0]],key]) as unknown as {resident_id:string;payment_id:string};
      expect(replay).toEqual(first);
      const payment=await scalar('select id from public.payments where idempotency_key=$1',[key]);
      const residentId=await scalar('select resident_id from public.payments where id=$1',[payment]);
      expect(await scalar('select registration_status from public.residents where id=$1',[residentId])).toBe('pending');
      expect(await scalar('select count(*)::text from public.agent_commissions where agent_id=$1',[agent])).toBe('0');
      await db.exec('savepoint invalid_agent_payment');
      await expect(db.query("select public.settle_payment($1,'mock','agent-ref','agent-event',2999,'TZS')",[payment])).rejects.toThrow('Invalid verified payment');
      await db.exec('rollback to savepoint invalid_agent_payment');
      const subscription=await scalar("select public.settle_payment($1,'mock','agent-ref','agent-event',3000,'TZS')",[payment]);
      expect(await scalar("select public.settle_payment($1,'mock','agent-ref','agent-event',3000,'TZS')",[payment])).toBe(subscription);
      expect(await scalar('select count(*)::text from public.agent_commissions where payment_id=$1',[payment])).toBe('1');
      expect(await scalar('select amount::text from public.agent_commissions where payment_id=$1',[payment])).toBe('300');
      expect(await scalar("select public.agent_commission_summary($1,$1)->>'balance'",[agent])).toBe('300');
      expect(await scalar("select public.agent_commission_summary($1,$2)->>'balance'",[admin,agent])).toBe('300');
      await db.exec('savepoint forbidden_agent_summary');
      await expect(db.query("select public.agent_commission_summary($1,$2)",[leader,agent])).rejects.toThrow('Forbidden');
      await db.exec('rollback to savepoint forbidden_agent_summary');
      expect((await asUser(agent,'select amount from public.agent_commissions')).rows).toHaveLength(1);
      expect((await asUser(other,'select amount from public.agent_commissions')).rows).toHaveLength(0);
    }finally{await db.exec('rollback');}
  });
  it('keeps agent mutation and commission summary RPCs unavailable to browser roles',async()=>{
    for(const signature of ['public.register_agent_resident(uuid,uuid,uuid,text,text,uuid[],boolean,text,uuid,uuid[])','public.agent_commission_summary(uuid,uuid)']){
      expect(await scalar('select has_function_privilege($1,$2,\'execute\')::text',['authenticated',signature])).toBe('false');
    }
  });
  it('registers without Auth, charges exactly 3000, and replays only the same receipt request',async()=>{
    await db.exec('begin');
    try{
      const args=['a'.repeat(64),'b'.repeat(64),mtaa,balozi,'Self Registered','+255712345688',[categories[0]],true,'mock'];
      const call='select public.register_public_resident($1,$2,$3,$4,$5,$6,$7,$8,$9)';
      const pid=await scalar(call,args);
      expect(await scalar(call,args)).toBe(pid);
      expect(await scalar('select amount::text from public.payments where id=$1',[pid])).toBe('3000');
      const rid=await scalar('select resident_id from public.payments where id=$1',[pid]);
      expect(await scalar('select registration_status from public.residents where id=$1',[rid])).toBe('pending');
      expect(await scalar('select count(*)::text from auth.users')).toBe('4');
      expect(await scalar('select count(*)::text from public.subscriptions where resident_id=$1',[rid])).toBe('0');
      expect(await scalar("select public.public_registration_receipt($1)->>'payment_id'",[args[0]])).toBe(pid);
      expect(await scalar('select public.public_registration_receipt($1)',['0'.repeat(64)])).toBeNull();
      await db.exec('savepoint changed_request');
      const changed=[...args];changed[1]='1'.repeat(64);
      await expect(db.query(call,changed)).rejects.toThrow('Session conflict');
      await db.exec('rollback to savepoint changed_request');
      await db.exec('savepoint shared_phone');
      const duplicate=[...args];duplicate[0]='2'.repeat(64);duplicate[4]='Overwrite Attempt';
      const secondPayment=await scalar(call,duplicate);
      expect(secondPayment).not.toBe(pid);
      expect(await scalar('select count(*)::text from public.residents where mtaa_id=$1 and phone_number=$2',[mtaa,args[5]])).toBe('2');
      await db.exec('rollback to savepoint shared_phone');
      expect(await scalar('select full_name from public.residents where id=$1',[rid])).toBe('Self Registered');
      await db.query('update private.registration_sessions set expires_at=now()-interval \'1 second\' where token_hash=$1',[args[0]]);
      expect(await scalar('select public.public_registration_receipt($1)',[args[0]])).toBeNull();
    }finally{await db.exec('rollback');}
  });
  it('requires both verified payment and Mtaa approval before queuing one welcome SMS',async()=>{
    await db.exec('begin');
    try{
      const pid=await scalar('select public.register_public_resident($1,$2,$3,$4,$5,$6,$7,true,\'mock\')',['c'.repeat(64),'d'.repeat(64),mtaa,balozi,'Awaiting Approval','+255712345687',[categories[0]]]);
      const rid=await scalar('select resident_id from public.payments where id=$1',[pid]);
      const settle="select public.settle_payment($1,'mock','public-test-ref','public-test-event',3000,'TZS')";
      const sub=await scalar(settle,[pid]);
      expect(await scalar(settle,[pid])).toBe(sub);
      expect(await scalar('select private.eligible($1)::text',[rid])).toBe('false');
      expect(await scalar('select count(*)::text from public.sms_campaigns where welcome_resident_id=$1',[rid])).toBe('0');
      await db.query('select public.save_resident($1,$2,$3,$4,$5,$6,true,true,$7)',[leader,mtaa,balozi,'Awaiting Approval','+255712345687',[categories[0]],rid]);
      expect(await scalar('select private.eligible($1)::text',[rid])).toBe('true');
      expect(await scalar('select count(*)::text from public.sms_campaigns where welcome_resident_id=$1',[rid])).toBe('1');
      expect(await scalar('select count(*)::text from public.subscriptions where resident_id=$1',[rid])).toBe('1');
    }finally{await db.exec('rollback');}
  });
  it('rejects public registration with mismatched Balozi, missing consent or excess categories atomically',async()=>{
    const args=['e'.repeat(64),'f'.repeat(64),mtaa,balozi,'Invalid Applicant','+255712345686',[categories[0]],true,'pending'];
    const call='select public.register_public_resident($1,$2,$3,$4,$5,$6,$7,$8,$9)';
    const wrongArea=[...args];wrongArea[3]=balozi2;
    await expect(db.query(call,wrongArea)).rejects.toThrow('Invalid area');
    const noConsent=[...args];noConsent[7]=false;
    await expect(db.query(call,noConsent)).rejects.toThrow();
    const tooMany=[...args];tooMany[6]=categories.slice(0,3);
    await expect(db.query(call,tooMany)).rejects.toThrow();
    expect(await scalar("select count(*)::text from public.residents where phone_number='+255712345686'")).toBe('0');
  });
  it('denies browser roles public registration RPCs and private receipt data',async()=>{
    for(const role of ['anon','authenticated']){
      expect(await scalar("select has_function_privilege($1,'public.register_public_resident(text,text,uuid,uuid,text,text,uuid[],boolean,text,uuid[])','execute')::text",[role])).toBe('false');
      expect(await scalar("select has_function_privilege($1,'public.public_registration_receipt(text)','execute')::text",[role])).toBe('false');
      expect(await scalar("select has_table_privilege($1,'private.registration_sessions','select')::text",[role])).toBe('false');
    }
  });
  it('saves manual Mtaa and Balozi with parents and audit records, enforcing administrator scope',async()=>{
    const ward=await scalar('select ward_id from public.mitaa where id=$1',[mtaa]);
    await expect(scalar("select public.save_location($1,'mitaa','Forbidden Mtaa',$2)",[leader,ward])).rejects.toThrow();
    await expect(scalar("select public.save_location($1,'balozi_areas','Forbidden Area',$2)",[leader,mtaa2])).rejects.toThrow();
    await db.exec('begin');
    try {
      const created=await scalar("select public.save_location($1,'mitaa','Manual Mtaa',$2)",[admin,ward]);
      const area=await scalar("select public.save_location($1,'balozi_areas','Manual Area',$2,null,'active','Balozi Name')",[admin,created]);
      expect(await scalar('select ward_id from public.mitaa where id=$1',[created])).toBe(ward);
      expect(await scalar('select mtaa_id from public.balozi_areas where id=$1',[area])).toBe(created);
      expect(await scalar('select balozi_name from public.balozi_areas where id=$1',[area])).toBe('Balozi Name');
      expect(await scalar('select count(*)::text from public.audit_logs where entity_id in ($1,$2)',[created,area])).toBe('2');
      const localArea=await scalar("select public.save_location($1,'balozi_areas','Leader Created Area',$2)",[leader,mtaa]);
      expect((await asUser(leader,`select id from public.balozi_areas where id='${localArea}'`)).rows).toHaveLength(1);
      expect((await asUser(other,`select id from public.balozi_areas where id='${localArea}'`)).rows).toHaveLength(0);
      const saved=await scalar('select public.save_resident($1,$2,$3,$4,$5,$6,true,true)',[admin,created,area,'Manually Located Resident','+255712345699',[categories[0]]]);
      expect(await scalar('select balozi_area_id from public.residents where id=$1',[saved])).toBe(area);
    }finally{await db.exec('rollback');}
  });
  it('allows registration without Balozi while preserving optional Balozi targeting',async()=>{
    await db.exec('begin');
    try{
      const rid=await scalar('select public.save_resident($1,$2,null,$3,$4,$5,true,true)',[leader,mtaa,'No Balozi Resident','+255712345698',[categories[0]]]);
      expect(await scalar('select (balozi_area_id is null)::text from public.residents where id=$1',[rid])).toBe('true');
      expect(await scalar('select balozi_name from public.resident_directory where id=$1',[rid])).toBe('');
      const payment=await scalar("select public.create_payment($1,$2,'mock',gen_random_uuid())",[leader,rid]);
      await db.query("select public.settle_payment($1,'mock','optional-balozi-ref','optional-balozi-event',3000,'TZS')",[payment]);
      expect(await scalar('select private.eligible($1)::text',[rid])).toBe('true');
      const all=await scalar("select public.preview_campaign($1,$2,'All includes no Balozi','Habari','all',null,null,'{}',1)",[leader,mtaa]);
      const area=await scalar("select public.preview_campaign($1,$2,'Balozi excludes unassigned','Habari','balozi',$3,null,'{}',1)",[leader,mtaa,balozi]);
      expect(Number(await scalar('select total_recipients::text from public.sms_campaigns where id=$1',[all]))).toBeGreaterThan(Number(await scalar('select total_recipients::text from public.sms_campaigns where id=$1',[area])));
    }finally{await db.exec('rollback');}
  });
  it('imports the complete pinned NBS hierarchy with original names and correct parents',async()=>{
    expect(await scalar("select count(*)::text from public.regions where source_dataset='nbs-2022-wards-2024'")).toBe('31');
    expect(await scalar("select count(*)::text from public.districts where source_dataset='nbs-2022-wards-2024'")).toBe('150');
    expect(await scalar("select count(*)::text from public.wards where source_dataset='nbs-2022-wards-2024'")).toBe('4344');
    expect(await scalar("select count(*)::text from public.wards w join public.districts d on d.id=w.district_id join public.regions r on r.id=d.region_id where w.source_dataset='nbs-2022-wards-2024' and (w.source_metadata->>'region_code'<>r.source_key or d.source_key<>(w.source_metadata->>'region_code')||':'||(w.source_metadata->>'district_code'))")).toBe('0');
    expect(await scalar("select count(*)::text from public.wards where source_dataset='nbs-2022-wards-2024' and source_metadata->>'region_code' in ('51','52','53','54','55')")).toBe('388');
    expect(await scalar("select count(*)::text from public.wards where source_dataset='nbs-2022-wards-2024' and name<>official_name")).toBe('6');
    expect(await scalar("select count(*)::text from public.wards where official_name='Tembela' and source_metadata->>'region_code'='12'")).toBe('2');
  });
  it('replays the reviewed data import without duplicate rows, changed IDs or audit entries',async()=>{
    const first=await scalar("select id from public.wards where source_dataset='nbs-2022-wards-2024' and source_key='1'");
    await db.exec(readFileSync('supabase/migrations/202609250007_nbs_2022_locations.sql','utf8'));
    expect(await scalar("select id from public.wards where source_dataset='nbs-2022-wards-2024' and source_key='1'")).toBe(first);
    expect(await scalar("select count(*)::text from public.wards where source_dataset='nbs-2022-wards-2024'")).toBe('4344');
    expect(await scalar("select count(*)::text from public.audit_logs where action='locations.imported' and metadata->>'dataset'='nbs-2022-wards-2024'")).toBe('1');
  });
  it('isolates tenants including the directory view and denies anonymous access', async () => {
    const result = await asUser(leader, 'select id from public.residents');
    expect(result.rows).toHaveLength(2);
    expect((await asUser(leader, `select id from public.resident_directory where id='${otherResident}'`)).rows).toHaveLength(0);
    expect((await asUser(admin, 'select id from public.residents')).rows).toHaveLength(0);
    await db.exec('set role anon');
    try { await expect(db.query('select * from public.residents')).rejects.toThrow(); } finally { await db.exec('reset role'); }
  });
  it('denies direct mutation, profile escalation and service RPC execution by browser users', async () => {
    await expect(asUser(leader, `update public.profiles set role='super_admin',mtaa_id=null where id='${leader}'`)).rejects.toThrow();
    await expect(asUser(leader, `select public.set_resident_status('${leader}','${resident}','suspended')`)).rejects.toThrow();
    await expect(db.query('select public.set_resident_status($1,$2,$3)', [leader, otherResident, 'suspended'])).rejects.toThrow('Forbidden');
  });
  it('rejects cross-tenant Balozi and a third category', async () => {
    await expect(db.query('select public.save_resident($1,$2,$3,$4,$5,$6,true,true)', [leader,mtaa,balozi2,'Invalid Area','+255712345681',[categories[0]]])).rejects.toThrow();
    await expect(db.query('insert into public.resident_categories values($1,$2)', [resident,categories[2]])).rejects.toThrow('Maximum two categories');
    await expect(db.query('select public.save_resident($1,$2,$3,$4,$5,$6,true,true)', [leader,mtaa,balozi,'Invalid Categories','+255712345681',categories.slice(0,3)])).rejects.toThrow();
  });
  it('allows shared names and phone numbers while rejecting invalid registrations atomically', async () => {
    const shared=await scalar('select public.save_resident($1,$2,$3,$4,$5,$6,true,true)',[leader,mtaa,balozi,'Resident One','+255712345678',[categories[0]]]);
    expect(shared).not.toBe(resident);
    await expect(db.query('select public.save_resident($1,$2,$3,$4,$5,$6,true,false)',[leader,mtaa,balozi,'No Consent','+255712345682',[categories[0]]])).rejects.toThrow('Consent required');
    const foreignCategory=await scalar("select public.save_location($1,'categories','Other Local Group',$2)",[admin,mtaa2]);
    await expect(db.query('select public.save_resident($1,$2,$3,$4,$5,$6,true,true)',[leader,mtaa,balozi,'Cross Category','+255712345682',[foreignCategory]])).rejects.toThrow('Invalid category');
    expect(await scalar("select count(*)::text from public.residents where phone_number='+255712345682'")).toBe('0');
  });
  it('verifies exact price and idempotent payment activation with six calendar months', async () => {
    const payment = await scalar("select public.create_payment($1,$2,'mock',gen_random_uuid())", [leader,resident]);
    await expect(db.query("select public.settle_payment($1,'mock','ref-1','event-1',2999,'TZS')",[payment])).rejects.toThrow();
    const sid = await scalar("select public.settle_payment($1,'mock','ref-1','event-1',3000,'TZS')",[payment]);
    expect(await scalar("select public.settle_payment($1,'mock','ref-1','event-1',3000,'TZS')",[payment])).toBe(sid);
    expect(await scalar('select count(*)::text from public.subscriptions where resident_id=$1',[resident])).toBe('1');
    expect(await scalar("select (expires_at=(starts_at at time zone 'Africa/Dar_es_Salaam'+interval '6 months') at time zone 'Africa/Dar_es_Salaam')::text from public.subscriptions where id=$1",[sid])).toBe('true');
    expect(await scalar("select count(*)::text from public.sms_campaigns where welcome_resident_id=$1",[resident])).toBe('1');
  });
  it('targets only eligible residents by all, Balozi, category, combination and selection', async () => {
    for (const [type, area, category, selected, expected] of [
      ['all',null,null,[],1],['balozi',balozi,null,[],1],['balozi',secondArea,null,[],0],
      ['category',null,categories[0],[],1],['category',null,categories[2],[],0],
      ['balozi_category',balozi,categories[0],[],1],['balozi_category',secondArea,categories[0],[],0],
      ['selected',null,null,[resident,unpaid],1],
    ] as const) {
      const cid = await scalar('select public.preview_campaign($1,$2,$3,$4,$5,$6,$7,$8,1)',[leader,mtaa,'Test campaign','Habari',type,area,category,selected]);
      expect(await scalar('select total_recipients::text from public.sms_campaigns where id=$1',[cid])).toBe(String(expected));
    }
  });
  it('scopes grouping fields to the owning tenant and lets a Super Admin own platform fields', async () => {
    const localField = await scalar("select public.save_grouping_field($1,$2,'Aina ya biashara')",[leader,mtaa]);
    const globalField = await scalar("select public.save_grouping_field($1,null,'Umri')",[admin]);
    expect(await scalar('select mtaa_id::text from public.grouping_fields where id=$1',[localField])).toBe(mtaa);
    expect(await scalar('select (mtaa_id is null)::text from public.grouping_fields where id=$1',[globalField])).toBe('true');
    await expect(db.query("select public.save_grouping_field($1,null,'Umri')",[leader])).rejects.toThrow('Forbidden');
    await expect(db.query("select public.save_grouping_field($1,$2,'Foreign field')",[leader,mtaa2])).rejects.toThrow('Forbidden');
    await expect(db.query("select public.save_grouping_field($1,$2,'Foreign field')",[other,mtaa])).rejects.toThrow('Forbidden');
    await expect(db.query("select public.save_grouping_field($1,$2,'Aina ya biashara')",[leader,mtaa])).rejects.toThrow();
    await expect(db.query("select public.save_grouping_field($1,$2,'Renamed','active',$3)",[other,mtaa2,localField])).rejects.toThrow('Grouping field not found');
  });
  it('assigns at most one grouping value per field and enforces tenant and active state', async () => {
    const field = await scalar("select id from public.grouping_fields where name='Aina ya biashara' and mtaa_id=$1",[mtaa]);
    const globalField = await scalar("select id from public.grouping_fields where name='Umri' and mtaa_id is null");
    const farmers = await scalar("select public.save_grouping_value($1,$2,'Wakulima')",[leader,field]);
    const traders = await scalar("select public.save_grouping_value($1,$2,'Wafanyabiashara')",[leader,field]);
    const adults = await scalar("select public.save_grouping_value($1,$2,'Watu wazima')",[admin,globalField]);
    await db.query('select public.set_resident_groups($1,$2,$3)',[leader,resident,[farmers,adults]]);
    expect(await scalar('select count(*)::text from public.resident_groups where resident_id=$1',[resident])).toBe('2');
    expect(await scalar('select group_names from public.resident_directory where id=$1',[resident])).toContain('Wakulima');
    await expect(db.query('select public.set_resident_groups($1,$2,$3)',[leader,resident,[farmers,traders]])).rejects.toThrow('One value per grouping field');
    await expect(db.query('insert into public.resident_groups(resident_id,value_id,field_id) values($1,$2,$3)',[resident,traders,field])).rejects.toThrow();
    const foreignField = await scalar("select public.save_grouping_field($1,$2,'Aina ya biashara')",[other,mtaa2]);
    const foreignValue = await scalar("select public.save_grouping_value($1,$2,'Wakulima')",[other,foreignField]);
    await expect(db.query('select public.set_resident_groups($1,$2,$3)',[leader,resident,[foreignValue]])).rejects.toThrow('Invalid group value');
    await db.query("select public.save_grouping_value($1,$2,'Wakulima','inactive',$3)",[leader,field,farmers]);
    await expect(db.query('select public.set_resident_groups($1,$2,$3)',[leader,resident,[farmers]])).rejects.toThrow('Invalid group value');
    await db.query("select public.save_grouping_value($1,$2,'Wakulima','active',$3)",[leader,field,farmers]);
    const grouped = await scalar('select public.save_resident($1,$2,$3,$4,$5,$6,true,true,null,$7)',[leader,mtaa,secondArea,'Grouped Resident','+255712345683',[categories[0]],[adults]]);
    expect(await scalar('select count(*)::text from public.resident_groups where resident_id=$1',[grouped])).toBe('1');
  });
  it('accepts an optional public grouping choice without requiring Balozi',async()=>{
    await db.exec('begin');
    try{
      const field=await scalar("select id from public.grouping_fields where name='Umri' and mtaa_id is null");
      const adults=await scalar("select id from public.grouping_values where name='Watu wazima' and field_id=$1",[field]);
      const payment=await scalar("select public.register_public_resident($1,$2,$3,null,$4,$5,$6,true,'pending',$7)",['9'.repeat(64),'8'.repeat(64),mtaa,'Public Grouped','+255712345697',[categories[0]],[adults]]);
      const rid=await scalar('select resident_id from public.payments where id=$1',[payment]);
      expect(await scalar('select value_id from public.resident_groups where resident_id=$1',[rid])).toBe(adults);
      expect(await scalar('select (balozi_area_id is null)::text from public.residents where id=$1',[rid])).toBe('true');
    }finally{await db.exec('rollback');}
  });
  it('targets a campaign by a selected grouping value and keeps legacy preview calls working', async () => {
    const globalField = await scalar("select id from public.grouping_fields where name='Umri' and mtaa_id is null");
    const adults = await scalar("select id from public.grouping_values where name='Watu wazima' and field_id=$1",[globalField]);
    const cid = await scalar("select public.preview_campaign($1,$2,'Group campaign','Habari','group',null,null,'{}',1,$3,$4)",[leader,mtaa,globalField,adults]);
    expect(await scalar('select total_recipients::text from public.sms_campaigns where id=$1',[cid])).toBe('1');
    expect(await scalar("select target->>'group_value' from public.sms_campaigns where id=$1",[cid])).toBe(adults);
    const foreignField = await scalar("select id from public.grouping_fields where name='Aina ya biashara' and mtaa_id=$1",[mtaa2]);
    const foreignValue = await scalar("select id from public.grouping_values where field_id=$1",[foreignField]);
    await expect(db.query("select public.preview_campaign($1,$2,'Bad group','Habari','group',null,null,'{}',1,$3,$4)",[leader,mtaa,foreignField,foreignValue])).rejects.toThrow('Invalid group value');
    const legacy = await scalar("select public.preview_campaign($1,$2,'Legacy call','Habari','all',null,null,'{}',1)",[leader,mtaa]);
    expect(await scalar('select total_recipients::text from public.sms_campaigns where id=$1',[legacy])).toBe('1');
  });
  it('keeps grouping RPCs unavailable to browser roles', async () => {
    expect(await scalar("select has_function_privilege('authenticated','public.save_grouping_field(uuid,uuid,text,text,uuid)','execute')::text")).toBe('false');
    expect(await scalar("select has_function_privilege('authenticated','public.save_grouping_value(uuid,uuid,text,text,uuid)','execute')::text")).toBe('false');
    expect(await scalar("select has_function_privilege('authenticated','public.set_resident_groups(uuid,uuid,uuid[])','execute')::text")).toBe('false');
    await expect(asUser(leader,"select public.save_grouping_field('"+leader+"',null,'Nope')")).rejects.toThrow();
  });
  it('stores per-Mtaa SMS mode without exposing provider credentials to browser roles',async()=>{
    await db.query("select public.save_mtaa_sms_configuration($1,$2,'own','gramvista','MTAAONE','encrypted-key','encrypted-webhook')",[leader,mtaa]);
    expect(await scalar('select mode from public.mtaa_sms_settings where mtaa_id=$1',[mtaa])).toBe('own');
    expect(await scalar("select public.mtaa_sms_configuration($1)->>'encrypted_api_key'",[mtaa])).toBe('encrypted-key');
    await expect(db.query("select public.save_mtaa_sms_configuration($1,$2,'own','gramvista','OTHER','key',null)",[other,mtaa])).rejects.toThrow('Forbidden');
    expect(await scalar("select has_function_privilege('authenticated','public.mtaa_sms_configuration(uuid)','execute')::text")).toBe('false');
    await expect(asUser(leader,'select * from private.mtaa_sms_credentials')).rejects.toThrow();
    await db.query("select public.save_mtaa_sms_configuration($1,$2,'platform','gramvista',null,null,null)",[leader,mtaa]);
    expect(await scalar('select count(*)::text from private.mtaa_sms_credentials where mtaa_id=$1',[mtaa])).toBe('0');
  });
  it('rejects foreign selected residents and denies confirmation by the wrong tenant', async () => {
    await expect(db.query("select public.preview_campaign($1,$2,'Foreign selection','Habari','selected',null,null,$3,1)",[leader,mtaa,[otherResident]])).rejects.toThrow();
    const cid=await scalar("select public.preview_campaign($1,$2,'Confirm me','Habari','all',null,null,'{}',1)",[leader,mtaa]);
    await expect(db.query('select public.confirm_campaign($1,$2)',[other,cid])).rejects.toThrow('Forbidden');
    await db.query('select public.confirm_campaign($1,$2)',[leader,cid]);
    await expect(db.query('select public.confirm_campaign($1,$2)',[leader,cid])).rejects.toThrow('already confirmed');
    // Keep the queue assertion below focused on the welcome message.
    await db.query("update public.sms_campaigns set status='cancelled' where id=$1",[cid]);
  });
  it('extends renewals from current expiry and does not queue a second welcome', async () => {
    const previous=await scalar('select max(expires_at)::text from public.subscriptions where resident_id=$1',[resident]);
    const payment=await scalar("select public.create_payment($1,$2,'mock',gen_random_uuid())",[leader,resident]);
    const sid=await scalar("select public.settle_payment($1,'mock','ref-renew','event-renew',3000,'TZS')",[payment]);
    expect(await scalar('select starts_at::text from public.subscriptions where id=$1',[sid])).toBe(previous);
    expect(await scalar('select count(*)::text from public.sms_campaigns where welcome_resident_id=$1',[resident])).toBe('1');
    expect(await scalar("select (timestamp '2028-08-31' + interval '6 months')::date::text")).toBe('2029-02-28');
    expect(await scalar("select (timestamp '2023-08-31' + interval '6 months')::date::text")).toBe('2024-02-29');
  });
  it('maps ClickPesa retries to one citizen payment without exposing provider RPCs', async () => {
    await db.exec('begin');
    try{
      const payment=await scalar("select public.register_public_resident($1,$2,$3,null,$4,$5,$6,true,'clickpesa')",[
        '7'.repeat(64),'6'.repeat(64),mtaa,'ClickPesa Resident','+255712345698',[categories[0]],
      ]);
      expect(await scalar('select provider from public.payments where id=$1',[payment])).toBe('clickpesa');
      const first=await scalar("select public.prepare_payment_attempt($1,'clickpesa')",[payment]);
      expect(first).toMatch(/^MC[A-F0-9]{16}01$/);
      expect(await scalar("select public.prepare_payment_attempt($1,'clickpesa')",[payment])).toBe(first);
      await db.query("select public.record_payment_attempt($1,'clickpesa',$2,'CP-FAILED','failed')",[payment,first]);
      const second=await scalar("select public.prepare_payment_attempt($1,'clickpesa')",[payment]);
      expect(second).toMatch(/^MC[A-F0-9]{16}02$/);
      expect(second).not.toBe(first);
      expect(await scalar("select public.latest_payment_attempt($1,'clickpesa')",[payment])).toBe(second);
      await db.query("select public.record_payment_attempt($1,'clickpesa',$2,'CP-SUCCESS','successful')",[payment,second]);
      await db.query("select public.record_payment_attempt($1,'clickpesa',$2,'CP-SUCCESS','failed')",[payment,second]);
      expect(await scalar('select status from private.payment_attempts where order_reference=$1',[second])).toBe('successful');
      await db.exec('savepoint mismatched_clickpesa_transaction');
      await expect(db.query("select public.record_payment_attempt($1,'clickpesa',$2,'CP-OTHER','successful')",[payment,second])).rejects.toThrow('Payment attempt not found');
      await db.exec('rollback to savepoint mismatched_clickpesa_transaction');
      expect(await scalar("select public.payment_for_order_reference('clickpesa',$1)",[first])).toBe(payment);
      expect(await scalar("select public.payment_for_order_reference('clickpesa',$1)",[second])).toBe(payment);
      for(const signature of [
        'public.prepare_payment_attempt(uuid,text)',
        'public.record_payment_attempt(uuid,text,text,text,text)',
        'public.payment_for_order_reference(text,text)',
        'public.latest_payment_attempt(uuid,text)',
      ]) expect(await scalar("select has_function_privilege('authenticated',$1,'execute')::text",[signature])).toBe('false');
    }finally{await db.exec('rollback');}
  });
  it('blocks tenant mutation of payments and audit logs and reuses payment-request keys', async () => {
    const key='10000000-0000-4000-8000-000000000009';
    const first=await scalar("select public.create_payment($1,$2,'mock',$3)",[leader,unpaid,key]);
    expect(await scalar("select public.create_payment($1,$2,'mock',$3)",[leader,unpaid,key])).toBe(first);
    await expect(db.query("select public.create_payment($1,$2,'mock',$3)",[leader,resident,key])).rejects.toThrow('Idempotency key conflict');
    await expect(asUser(leader,"update public.payments set status='successful'")).rejects.toThrow();
    await expect(asUser(leader,'delete from public.audit_logs')).rejects.toThrow();
    await expect(asUser(leader,"select public.settle_payment('10000000-0000-4000-8000-000000000009','mock','r','e',3000,'TZS')")).rejects.toThrow();
  });
  it('claims each queued SMS once, records delivery idempotently and excludes expired subscriptions', async () => {
    const first = await db.query<{id:string}>('select * from public.claim_sms(50)');
    expect(first.rows).toHaveLength(1); // Welcome only; previews remain drafts.
    expect((await db.query('select * from public.claim_sms(50)')).rows).toHaveLength(0);
    await db.query("select public.record_sms_result($1,'mock','sms-1','sent')",[first.rows[0].id]);
    await db.query("select public.record_sms_delivery('mock','sms-1','delivered')");
    await db.query("select public.record_sms_delivery('mock','sms-1','failed')");
    expect(await scalar('select status from public.sms_recipients where id=$1',[first.rows[0].id])).toBe('delivered');
    await db.query("update public.subscriptions set starts_at=now()-interval '7 months',expires_at=now()-interval '1 month' where resident_id=$1",[resident]);
    const cid = await scalar("select public.preview_campaign($1,$2,'Expired exclusion','Habari','all',null,null,'{}',1)",[leader,mtaa]);
    expect(await scalar('select total_recipients::text from public.sms_campaigns where id=$1',[cid])).toBe('0');
  });
  it('immediately revokes tenant reads when an administrator is suspended', async () => {
    await db.query("update public.profiles set status='suspended' where id=$1",[leader]);
    expect((await asUser(leader,'select * from public.residents')).rows).toHaveLength(0);
    await expect(db.query('select public.set_resident_status($1,$2,$3)',[leader,resident,'suspended'])).rejects.toThrow('Unauthorized');
  });
  it('prevents repeated platform bootstrap and rate-limits login attempts', async () => {
    await expect(db.query("select public.bootstrap_super_admin($1,'Another admin')",[other])).rejects.toThrow('already exists');
    expect(await scalar("select public.consume_rate_limit('test-key',1,900)::text")).toBe('true');
    expect(await scalar("select public.consume_rate_limit('test-key',1,900)::text")).toBe('false');
    await expect(asUser(other,"select public.consume_rate_limit('test-key',1,900)")).rejects.toThrow();
  });
  it('estimates template units including GSM escapes and supplementary Unicode characters',async()=>{
    expect(await scalar("select private.sms_units(repeat('^',81))::text")).toBe('2');
    expect(await scalar("select private.sms_units(repeat('😀',36))::text")).toBe('2');
    expect(await scalar("select private.sms_units(repeat('a',160))::text")).toBe('1');
  });
});
