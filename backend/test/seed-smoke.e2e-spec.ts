import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-bootstrap';
import { SeedHttpClient } from '../src/seed/http-client';
import { SeedManifest } from '../src/seed/manifest';
import { createSeedContext, SeedContext } from '../src/seed/context';
import { bootstrapFirstAdmin } from '../src/seed/bootstrap-admin';
import { seedAccess } from '../src/seed/steps/access.seed';
import { seedCustomersAndVehicles } from '../src/seed/steps/customers.seed';
import { seedBays } from '../src/seed/steps/bays.seed';
import { seedInventoryCatalog } from '../src/seed/steps/inventory.seed';
import { seedPurchasing } from '../src/seed/steps/purchasing.seed';
import { seedJobs } from '../src/seed/steps/jobs.seed';
import { seedTraining } from '../src/seed/steps/training.seed';

/**
 * Runs the real demo seed (the exact same idempotent step functions `npm run seed` uses, against
 * a real, in-process instance of the full application) and then proves representative records
 * from every major domain are retrievable through real, permission-checked HTTP API calls — not
 * a database read. This is the "focused smoke test" required alongside the seed system: at least
 * one customer, one job card, one invoice, and one training enrollment.
 *
 * Reruns are safe: like `npm run seed`, this is idempotent via the on-disk seed manifest, so
 * running this spec repeatedly (or after `npm run seed` was already run manually) never
 * duplicates data.
 */
describe('Demo seed smoke test (e2e)', () => {
  let app: INestApplication;
  let ctx: SeedContext;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    const client = new SeedHttpClient(app);
    const manifest = SeedManifest.load();
    ctx = createSeedContext(app, client, manifest);

    await bootstrapFirstAdmin(app, client, ctx.log);
    await seedAccess(ctx);
    await seedCustomersAndVehicles(ctx);
    await seedBays(ctx);
    await seedInventoryCatalog(ctx);
    await seedPurchasing(ctx);
    await seedJobs(ctx);
    await seedTraining(ctx);
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  it('a seeded demo customer is retrievable via the real API', async () => {
    const page = await ctx.client.get('customers', 'advisor', { pageSize: 10 });
    expect(page.page.totalItems).toBeGreaterThanOrEqual(1);
    const customer = page.items[0];
    const fetched = await ctx.client.get(`customers/${customer.id}`, 'advisor');
    expect(fetched.id).toBe(customer.id);
    expect(typeof fetched.displayName).toBe('string');
  });

  it('a seeded demo job card is retrievable via the real API', async () => {
    const page = await ctx.client.get('job-cards', 'advisor', { pageSize: 10 });
    expect(page.page.totalItems).toBeGreaterThanOrEqual(1);
    const job = page.items[0];
    const fetched = await ctx.client.get(`job-cards/${job.id}`, 'advisor');
    expect(fetched.id).toBe(job.id);
    expect(fetched.stage).toBeDefined();
  });

  it('a seeded demo invoice is retrievable via the real API', async () => {
    const page = await ctx.client.get('invoices', 'advisor', { pageSize: 10 });
    expect(page.page.totalItems).toBeGreaterThanOrEqual(1);
    const invoice = page.items[0];
    const fetched = await ctx.client.get(`invoices/${invoice.id}`, 'advisor');
    expect(fetched.id).toBe(invoice.id);
    expect(fetched.totals.total.amount).toBeDefined();
  });

  it('a seeded demo training enrollment is retrievable via the real API', async () => {
    const groups = await ctx.client.get('training-groups', 'supervisor', { pageSize: 10 });
    expect(groups.page.totalItems).toBeGreaterThanOrEqual(1);
    const group = groups.items.find((g: { id: string }) => Boolean(g.id));
    const enrollments = await ctx.client.get(`training-groups/${group.id}/enrollments`, 'supervisor', { pageSize: 10 });
    expect(enrollments.page.totalItems).toBeGreaterThanOrEqual(1);
    const enrollment = enrollments.items[0];
    expect(enrollment.studentId).toBeDefined();
    expect(enrollment.status).toBeDefined();
  });

  it('demo accounts across roles can authenticate and see their own principal', async () => {
    const admin = await ctx.client.get('auth/me', 'admin');
    expect(admin.roles).toContain('SYSTEM_ADMIN');
    const technician = await ctx.client.get('auth/me', 'tech1');
    expect(technician.roles).toContain('TECHNICIAN');
  });
});
