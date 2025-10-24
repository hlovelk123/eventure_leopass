import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    DATABASE_URL: z.string().url({ message: 'DATABASE_URL must be a valid URL' }),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    CF_TURNSTILE_SITE_KEY: z.string().min(10),
    CF_TURNSTILE_SECRET_KEY: z.string().min(10),
    ZEPTO_API_KEY: z.string().optional(),
    ZEPTO_MAILAGENT_ALIAS: z.string().optional(),
    ZEPTO_SMTP_HOST: z.string().optional(),
    ZEPTO_SMTP_PORT: z.coerce.number().optional(),
    ZEPTO_SMTP_USER: z.string().optional(),
    ZEPTO_SMTP_PASS: z.string().optional(),
    BREVO1_API_KEY: z.string().optional(),
    APP_URL: z.string().url().optional(),
  })
  .superRefine((data, ctx) => {
    const hasZeptoApi = Boolean(data.ZEPTO_API_KEY && data.ZEPTO_MAILAGENT_ALIAS);
    const hasZeptoSmtp = Boolean(
      data.ZEPTO_SMTP_HOST && data.ZEPTO_SMTP_PORT && data.ZEPTO_SMTP_USER && data.ZEPTO_SMTP_PASS,
    );

    if (!hasZeptoApi && !hasZeptoSmtp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either ZeptoMail API credentials or SMTP credentials',
        path: ['ZEPTO_API_KEY'],
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export const validateEnv = (config: Record<string, unknown>): AppEnv => {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment variables: ${details}`);
  }
  return parsed.data;
};
