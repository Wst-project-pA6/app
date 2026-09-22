import { SeedContext } from '../context';
import { ensureCreated, findIdByField } from '../idempotent';
import { DEMO_BAYS } from '../fixtures';

export async function seedBays(ctx: SeedContext): Promise<void> {
  const { client, ids } = ctx;
  const branchScopeId = ids.scopes.branch1;

  ctx.log('Creating demo bays...');
  for (const bay of DEMO_BAYS) {
    const result = await ensureCreated(ctx, `bay:${bay.key}`, {
      create: () =>
        client.post('bays', 'manager', {
          organizationScopeId: branchScopeId,
          code: bay.code,
          name: bay.name,
          capacity: bay.capacity,
        }),
      recoverOnDuplicate: () => findIdByField(ctx, 'bays', 'manager', 'code', bay.code),
    });
    ids.bays[bay.key] = result.id;
  }
  ctx.log(`Bays ready: ${DEMO_BAYS.length}.`);
}
