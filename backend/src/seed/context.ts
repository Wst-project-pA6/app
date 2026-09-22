import { INestApplication } from '@nestjs/common';
import { SeedHttpClient } from './http-client';
import { SeedManifest } from './manifest';

export interface SeedContext {
  app: INestApplication;
  client: SeedHttpClient;
  manifest: SeedManifest;
  log: (message: string) => void;
  /** Resolved API ids keyed by fixture key, populated as each domain step runs (e.g. users['advisor']). */
  ids: {
    users: Record<string, string>;
    scopes: Record<string, string>;
    customers: Record<string, string>;
    vehicles: Record<string, string>;
    bays: Record<string, string>;
    parts: Record<string, string>;
    stores: Record<string, string>;
    vendors: Record<string, string>;
  };
}

export function createSeedContext(app: INestApplication, client: SeedHttpClient, manifest: SeedManifest): SeedContext {
  return {
    app,
    client,
    manifest,
    log: (message: string) => {
      process.stdout.write(`[seed] ${message}\n`);
    },
    ids: {
      users: {},
      scopes: {},
      customers: {},
      vehicles: {},
      bays: {},
      parts: {},
      stores: {},
      vendors: {},
    },
  };
}
