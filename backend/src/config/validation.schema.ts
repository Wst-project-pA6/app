import * as Joi from 'joi';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Enforces HTTPS for APP_BASE_URL in production, and allows plain HTTP only for local
 * development/test targets (localhost/127.0.0.1/[::1]) — a public HTTP base URL would let the
 * signed attachment-download link (and its query-string signature) travel in the clear.
 */
function validateBaseUrl(value: Record<string, unknown>, helpers: Joi.CustomHelpers): unknown {
  const baseUrl = value.APP_BASE_URL;
  if (typeof baseUrl !== 'string' || baseUrl.length === 0) return value;
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return helpers.error('any.invalid', { message: 'APP_BASE_URL must be a valid absolute URL' });
  }
  const isLocal = LOCAL_HOSTNAMES.has(parsed.hostname);
  if (value.NODE_ENV === 'production') {
    if (parsed.protocol !== 'https:') {
      return helpers.error('any.invalid', { message: 'APP_BASE_URL must use https in production' });
    }
  } else if (parsed.protocol === 'http:' && !isLocal) {
    return helpers.error('any.invalid', {
      message: 'APP_BASE_URL may only use http for localhost/127.0.0.1/[::1] outside production',
    });
  }
  return value;
}

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  APP_BASE_URL: Joi.string().uri({ scheme: ['http', 'https'] }).optional(),
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().port().default(5432),
  DB_NAME: Joi.string().default('DataBase_WorkShop_Management'),
  DB_USER: Joi.string().default('postgres'),
  DB_PASSWORD: Joi.string().allow('').default(''),
  DB_MAX_CONNECTIONS: Joi.number().integer().min(1).max(100).default(10),
  DB_IDLE_TIMEOUT_MS: Joi.number().integer().min(1000).default(30000),
  DB_CONNECTION_TIMEOUT_MS: Joi.number().integer().min(1000).default(5000),
  DB_SSL: Joi.boolean().default(false),
  AUTH_JWT_SECRET: Joi.string()
    .custom((value, helpers) =>
      Buffer.byteLength(value, 'utf8') >= 32 ? value : helpers.error('string.min'),
    )
    .required(),
  AUTH_JWT_ISSUER: Joi.string().valid('wst-api').default('wst-api'),
  AUTH_JWT_AUDIENCE: Joi.string().valid('wst-client').default('wst-client'),
  ATTACHMENTS_STORAGE_DIR: Joi.string().default('storage/attachments'),
  // Preferred over falling back to AUTH_JWT_SECRET; when set, held to the same minimum
  // strength. Left unset falls back to AUTH_JWT_SECRET (see configuration.ts) — never to a
  // hardcoded value.
  ATTACHMENTS_SIGNING_SECRET: Joi.string()
    .allow('')
    .custom((value, helpers) => {
      if (!value) return value;
      return Buffer.byteLength(value, 'utf8') >= 32 ? value : helpers.error('string.min');
    })
    .optional(),
})
  .unknown(true)
  .custom(validateBaseUrl);
