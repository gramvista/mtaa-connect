import { z } from 'zod';

const configSchema = z.object({
  CLICKPESA_API_BASE_URL: z.string().trim().min(1).transform((value, context) => {
    try {
      const url = new URL(value);
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'api.clickpesa.com' ||
        url.port ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname.replace(/\/$/, '') !== '/third-parties'
      ) {
        throw new Error('Unexpected ClickPesa API URL');
      }
      return url.toString().replace(/\/$/, '');
    } catch {
      context.addIssue({ code: 'custom', message: 'Invalid ClickPesa API URL' });
      return z.NEVER;
    }
  }),
  CLICKPESA_CLIENT_ID: z.string().trim().min(1),
  CLICKPESA_API_KEY: z.string().trim().min(1),
  // ClickPesa only requires this when checksum signing is enabled for the app.
  CLICKPESA_CHECKSUM_KEY: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().min(1).optional(),
  ),
});

export type ClickPesaConfig = z.infer<typeof configSchema>;

export function parseClickPesaConfig(input: Record<string, unknown>): ClickPesaConfig {
  const result = configSchema.safeParse(input);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid or missing ClickPesa configuration: ${fields.join(', ')}`);
  }
  return result.data;
}
