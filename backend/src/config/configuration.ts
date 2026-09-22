export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  app: {
    baseUrl: process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? '3000'}`,
  },
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    name: process.env.DB_NAME ?? 'DataBase_WorkShop_Management',
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS ?? '10', 10),
    idleTimeoutMs: parseInt(process.env.DB_IDLE_TIMEOUT_MS ?? '30000', 10),
    connectionTimeoutMs: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS ?? '5000', 10),
    ssl: process.env.DB_SSL === 'true',
  },
  auth: {
    jwtSecret: process.env.AUTH_JWT_SECRET,
    issuer: process.env.AUTH_JWT_ISSUER ?? 'wst-api',
    audience: process.env.AUTH_JWT_AUDIENCE ?? 'wst-client',
    accessTokenTtlSeconds: 600,
    refreshTokenTtlSeconds: 604800,
  },
  attachments: {
    storageDir: process.env.ATTACHMENTS_STORAGE_DIR ?? 'storage/attachments',
    signingSecret: process.env.ATTACHMENTS_SIGNING_SECRET ?? process.env.AUTH_JWT_SECRET ?? '',
  },
});
