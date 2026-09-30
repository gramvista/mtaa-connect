import { normalizePhone,occupationFields } from '../residents/schema';
import { otherOccupationCode } from '../residents/occupations';
import { z } from 'zod';

export const agentRegistrationSchema=z.object({
 mtaa_id:z.uuid(),balozi_area_id:z.union([z.uuid(),z.literal('')]).default(''),
 full_name:z.string().trim().min(2).max(120),
 phone_number:z.string().transform(normalizePhone).pipe(z.string().regex(/^\+255[67]\d{8}$/)),
 payment_phone:z.string().transform(normalizePhone).pipe(z.string().regex(/^\+255[67]\d{8}$/)),
 category_ids:z.array(z.uuid()).min(1).max(2).refine(ids=>new Set(ids).size===ids.length),
 group_values:z.array(z.uuid()).max(50).refine(ids=>new Set(ids).size===ids.length).default([]),
 ...occupationFields,
 consent:z.boolean().refine(Boolean),key:z.uuid(),
}).strict().superRefine((value,ctx)=>{
 const hasOther=value.occupation_codes.includes(otherOccupationCode);
 if(hasOther&&value.occupation_other.length<2)ctx.addIssue({code:'custom',path:['occupation_other'],message:'Describe the other occupation'});
 if(!hasOther&&value.occupation_other)ctx.addIssue({code:'custom',path:['occupation_other'],message:'Select the other occupation'});
});
export type AgentRegistrationInput=z.input<typeof agentRegistrationSchema>;
