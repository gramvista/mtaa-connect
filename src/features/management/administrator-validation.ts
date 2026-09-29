import { z } from 'zod';
import { adminText as t } from '../../i18n/admin';

const name = z.string().trim().min(2).max(120);
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const mtaaId = z.uuid();
const role = z.enum(['mtaa_admin', 'agent']);
const password = z.string().min(8).max(128);

export const createAdministratorSchema = z.object({
 name,
 email,
 password,
 confirmation: password,
 mtaa_id: mtaaId,
 role,
}).refine(data=>data.password===data.confirmation,{path:['confirmation'],message:'Passwords do not match'});

export const updateAdministratorSchema = z.object({
 id: z.uuid(),
 name,
 email,
 mtaa_id: mtaaId,
 status: z.enum(['active', 'suspended']),
 role,
});

export function administratorValidationError(error: z.ZodError) {
 const field = error.issues[0]?.path[0];
 if (field === 'name') return t.invalidAdministratorName;
 if (field === 'email') return t.invalidAdministratorEmail;
 if (field === 'password') return t.invalidAdministratorPassword;
 if (field === 'confirmation') return t.passwordMismatch;
 if (field === 'mtaa_id') return t.invalidAdministratorMtaa;
 return t.invalid;
}
