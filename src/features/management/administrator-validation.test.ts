import { describe,expect,it } from 'vitest';
import { administratorValidationError,createAdministratorSchema } from './administrator-validation';

const validAdministrator = {
 name: 'Chair Person',
 email: 'chairperson@example.com',
 password: 'temporary-password',
 confirmation: 'temporary-password',
 mtaa_id: '550e8400-e29b-41d4-a716-446655440000',
 role: 'mtaa_admin',
};

describe('administrator validation', () => {
 it('accepts a chairperson and normalizes whitespace and email casing', () => {
  const parsed=createAdministratorSchema.safeParse({...validAdministrator,email:'  ChairPerson@Example.COM  '});
  expect(parsed.success).toBe(true);
  if(parsed.success)expect(parsed.data.email).toBe('chairperson@example.com');
 });

 it.each([
  ['name',{name:'A'},'jina kamili'],
  ['email',{email:'not-an-email'},'barua pepe'],
  ['password',{password:'short'},'herufi 8'],
  ['confirmation',{confirmation:'different-password'},'havifanani'],
  ['mtaa_id',{mtaa_id:''},'Chagua Mtaa'],
 ] as const)('reports an actionable %s error',(_,change,message) => {
  const parsed=createAdministratorSchema.safeParse({...validAdministrator,...change});
  expect(parsed.success).toBe(false);
  if(!parsed.success)expect(administratorValidationError(parsed.error)).toContain(message);
 });
});
