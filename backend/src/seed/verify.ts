import { SeedContext } from './context';
import { DEMO_PASSWORD, DEMO_USERS } from './fixtures';

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

async function check(results: CheckResult[], name: string, fn: () => Promise<string>): Promise<void> {
  try {
    const detail = await fn();
    results.push({ name, passed: true, detail });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, detail });
  }
}

/**
 * Verifies the seed by making real, authenticated API calls (the same ones the frontend or a
 * manual smoke test would make) — never reads the database directly. Returns true only if every
 * check passed.
 */
export async function runVerification(ctx: SeedContext): Promise<boolean> {
  const { client } = ctx;
  const results: CheckResult[] = [];

  for (const user of DEMO_USERS) {
    await check(results, `login: ${user.email} (${user.role})`, async () => {
      await client.loginAs(user.key, user.email, DEMO_PASSWORD);
      const me = await client.get('auth/me', user.key);
      if (!(me.roles as string[]).includes(user.role)) {
        throw new Error(`expected role ${user.role}, got [${(me.roles as string[]).join(', ')}]`);
      }
      return `id=${me.id}`;
    });
  }

  await check(results, 'customers exist', async () => {
    const page = await client.get('customers', 'advisor', { pageSize: 1 });
    if (page.page.totalItems < 1) throw new Error('no customers found');
    return `totalItems=${page.page.totalItems}`;
  });

  await check(results, 'vehicles exist', async () => {
    const page = await client.get('vehicles', 'advisor', { pageSize: 1 });
    if (page.page.totalItems < 1) throw new Error('no vehicles found');
    return `totalItems=${page.page.totalItems}`;
  });

  let deliveredJobId: string | undefined;
  await check(results, 'a delivered job card exists', async () => {
    const page = await client.get('job-cards', 'advisor', { stage: 'DELIVERED', pageSize: 5 });
    if (page.page.totalItems < 1) throw new Error('no DELIVERED job cards found');
    deliveredJobId = page.items[0].id as string;
    return `jobId=${deliveredJobId}`;
  });

  if (deliveredJobId) {
    await check(results, 'delivered job has linked photo attachments', async () => {
      const page = await client.get(`job-cards/${deliveredJobId}/attachments`, 'advisor', { pageSize: 5 });
      if (page.page.totalItems < 1) throw new Error('no attachments linked to the delivered job');
      return `attachmentCount=${page.page.totalItems}`;
    });

    await check(results, 'delivered job has a stage history', async () => {
      const page = await client.get(`job-cards/${deliveredJobId}/stage-history`, 'advisor', { pageSize: 20 });
      if (page.page.totalItems < 1) throw new Error('no stage history recorded');
      return `transitions=${page.page.totalItems}`;
    });
  }

  await check(results, 'a paid invoice exists', async () => {
    const page = await client.get('invoices', 'advisor', { status: 'PAID', pageSize: 1 });
    if (page.page.totalItems < 1) throw new Error('no PAID invoices found');
    return `totalItems=${page.page.totalItems}`;
  });

  await check(results, 'a draft invoice exists', async () => {
    const page = await client.get('invoices', 'advisor', { status: 'DRAFT', pageSize: 1 });
    if (page.page.totalItems < 1) throw new Error('no DRAFT invoices found');
    return `totalItems=${page.page.totalItems}`;
  });

  await check(results, 'an issued (unpaid) invoice exists', async () => {
    const page = await client.get('invoices', 'advisor', { status: 'ISSUED', pageSize: 1 });
    if (page.page.totalItems < 1) throw new Error('no ISSUED invoices found');
    return `totalItems=${page.page.totalItems}`;
  });

  await check(results, 'parts catalog populated', async () => {
    const page = await client.get('parts', 'storekeeper', { pageSize: 1 });
    if (page.page.totalItems < 1) throw new Error('no parts found');
    return `totalItems=${page.page.totalItems}`;
  });

  await check(results, 'stock balances reflect received goods', async () => {
    const page = await client.get('stock-balances', 'storekeeper', { pageSize: 5 });
    if (page.page.totalItems < 1) throw new Error('no stock balances found');
    return `totalItems=${page.page.totalItems}`;
  });

  await check(results, 'a received purchase order exists', async () => {
    const page = await client.get('purchase-orders', 'storekeeper', { pageSize: 5 });
    const received = (page.items as Array<{ status: string }>).find((po) => po.status === 'RECEIVED');
    if (!received) throw new Error('no RECEIVED purchase order found');
    return 'status=RECEIVED';
  });

  await check(results, 'training terms/courses/groups exist', async () => {
    const terms = await client.get('training-terms', 'supervisor', { pageSize: 1 });
    const courses = await client.get('courses', 'supervisor', { pageSize: 1 });
    const groups = await client.get('training-groups', 'supervisor', { pageSize: 1 });
    if (terms.page.totalItems < 1 || courses.page.totalItems < 1 || groups.page.totalItems < 1) {
      throw new Error('training terms/courses/groups incomplete');
    }
    return `terms=${terms.page.totalItems} courses=${courses.page.totalItems} groups=${groups.page.totalItems}`;
  });

  await check(results, 'a training enrollment is retrievable', async () => {
    const groups = await client.get('training-groups', 'supervisor', { pageSize: 1 });
    const groupId = groups.items[0]?.id;
    if (!groupId) throw new Error('no training group to check enrollments against');
    const enrollments = await client.get(`training-groups/${groupId}/enrollments`, 'supervisor', { pageSize: 5 });
    if (enrollments.page.totalItems < 1) throw new Error('no enrollments found for the demo training group');
    return `enrollments=${enrollments.page.totalItems}`;
  });

  await check(results, 'a training session is scheduled', async () => {
    const page = await client.get('training-sessions', 'supervisor', { pageSize: 1 });
    if (page.page.totalItems < 1) throw new Error('no training sessions found');
    return `totalItems=${page.page.totalItems}`;
  });

  await check(results, 'a pending job approval exists', async () => {
    const page = await client.get('job-cards', 'advisor', { pageSize: 10 });
    let found = false;
    for (const job of page.items as Array<{ id: string; approvalSummary: { pendingApprovalCount: number } }>) {
      if (job.approvalSummary.pendingApprovalCount > 0) found = true;
    }
    if (!found) throw new Error('no job card has a pending approval');
    return 'found a job with pendingApprovalCount > 0';
  });

  const passed = results.every((result) => result.passed);
  ctx.log('Verification results:');
  for (const result of results) {
    ctx.log(`  [${result.passed ? 'PASS' : 'FAIL'}] ${result.name} - ${result.detail}`);
  }
  ctx.log(passed ? 'All verification checks passed.' : 'One or more verification checks FAILED.');
  return passed;
}
