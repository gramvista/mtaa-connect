import { residentBaseSchema,validateOccupationSelection } from '../residents/schema';
import { z } from 'zod';

// Explicit allowlist: a visitor cannot submit an ID, approval or payment status.
export const registrationSchema = residentBaseSchema.omit({id:true,approved:true}).extend({
 website:z.string().max(0).default(''),
}).strict().superRefine(validateOccupationSelection);
export type RegistrationInput = z.input<typeof registrationSchema>;
