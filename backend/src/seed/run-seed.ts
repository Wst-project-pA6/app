import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { configureApp } from '../app-bootstrap';
import { SeedHttpClient, SeedApiError } from './http-client';
import { SeedManifest } from './manifest';
import { createSeedContext } from './context';
import { bootstrapFirstAdmin } from './bootstrap-admin';
import { seedAccess } from './steps/access.seed';
import { seedCustomersAndVehicles } from './steps/customers.seed';
import { seedBays } from './steps/bays.seed';
import { seedInventoryCatalog } from './steps/inventory.seed';
import { seedPurchasing } from './steps/purchasing.seed';
import { seedJobs } from './steps/jobs.seed';
import { seedTraining } from './steps/training.seed';
import { runVerification } from './verify';
import { resetDemoData } from './reset';

async function bootApp() {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleFixture.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

async function runSeed(): Promise<void> {
  const app = await bootApp();
  try {
    const client = new SeedHttpClient(app);
    const manifest = SeedManifest.load();
    const ctx = createSeedContext(app, client, manifest);

    await bootstrapFirstAdmin(app, client, ctx.log);
    await seedAccess(ctx);
    await seedCustomersAndVehicles(ctx);
    await seedBays(ctx);
    await seedInventoryCatalog(ctx);
    await seedPurchasing(ctx);
    await seedJobs(ctx);
    await seedTraining(ctx);

    ctx.log('Demo seed complete.');
  } finally {
    await app.close();
  }
}

async function runVerify(): Promise<boolean> {
  const app = await bootApp();
  try {
    const client = new SeedHttpClient(app);
    const manifest = SeedManifest.load();
    const ctx = createSeedContext(app, client, manifest);
    return await runVerification(ctx);
  } finally {
    await app.close();
  }
}

async function runReset(): Promise<void> {
  const appContext = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    await resetDemoData(appContext, (message) => process.stdout.write(`[seed:reset] ${message}\n`));
  } finally {
    await appContext.close();
  }
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  try {
    if (args.has('--reset')) {
      await runReset();
      return;
    }
    if (args.has('--verify')) {
      const passed = await runVerify();
      if (!passed) process.exitCode = 1;
      return;
    }
    await runSeed();
  } catch (error) {
    if (error instanceof SeedApiError) {
      process.stderr.write(`${error.message}\n`);
    } else {
      process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    }
    process.exitCode = 1;
  }
}

void main();
