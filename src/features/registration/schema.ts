import { residentSchema } from '../residents/schema';
import { z } from 'zod';

// Explicit allowlist: a visitor cannot submit an ID, approval or payment status.
export const registrationSchema = residentSchema.omit({id:true,approved:true}).extend({
 website:z.string().max(0).default(''),
}).strict();
export type RegistrationInput = z.input<typeof registrationSchema>;
