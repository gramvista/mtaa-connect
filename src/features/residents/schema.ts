import { z } from 'zod';

export function normalizePhone(value: string) {
 const clean = value.replace(/[\s()-]/g,'');
 if (/^0[67]\d{8}$/.test(clean)) return '+255'+clean.slice(1);
 if (/^255[67]\d{8}$/.test(clean)) return '+'+clean;
 return clean;
}
export const phoneSchema = z.string().transform(normalizePhone).pipe(z.string().regex(/^\+255[67]\d{8}$/));
export const residentSchema = z.object({
 id: z.union([z.uuid(),z.literal('')]).optional(),
 mtaa_id: z.uuid(), balozi_area_id: z.union([z.uuid(),z.literal('')]).default(''),
 full_name: z.string().trim().min(2).max(120),
 phone_number: phoneSchema,
 category_ids: z.array(z.uuid()).min(1).max(2).refine(ids => new Set(ids).size === ids.length),
 group_values: z.array(z.uuid()).max(50).refine(ids => new Set(ids).size === ids.length).default([]),
 consent: z.boolean().refine(value => value), approved: z.boolean(),
});
export type ResidentInput = z.input<typeof residentSchema>;
