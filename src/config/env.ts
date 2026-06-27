import 'dotenv/config';

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  ALLOWED_ORIGINS: z
    .string()
    .default('*')
    .transform((val) => (val === '*' ? '*' : val.split(',').map((o) => o.trim()))),
  AIS_FEED_HOST: z.string().default(''),
  AIS_FEED_PORT: z.coerce.number().int().nonnegative().default(0),
  AIS_FEED_PROTOCOL: z.enum(['tcp', 'udp']).default('tcp'),
  AIS_FEED_RECONNECT_DELAY_MS: z.coerce.number().int().positive().default(5000),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    // NOTE: because the logger hasn't been initialized yet, that's why using console
    console.error('❌ Invalid environment variables:');

    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
export type Env = z.infer<typeof envSchema>;
