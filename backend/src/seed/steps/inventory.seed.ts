import { SeedContext } from '../context';
import { ensureCreated, findIdByField } from '../idempotent';
import { CURRENCY, DEMO_PARTS, DEMO_STORE } from '../fixtures';

export async function seedInventoryCatalog(ctx: SeedContext): Promise<void> {
  const { client, ids } = ctx;
  const storeScopeId = ids.scopes.store;

  ctx.log('Creating parts catalog...');
  for (const part of DEMO_PARTS) {
    const result = await ensureCreated(ctx, `part:${part.key}`, {
      verify: async (id) => (await client.tryGet(`parts/${id}`, 'storekeeper')) !== null,
      create: () =>
        client.post('parts', 'storekeeper', {
          sku: part.sku,
          name: { en: part.nameEn },
          category: part.category,
          unitOfMeasure: part.unitOfMeasure,
          sellingPrice: { amount: part.sellingPriceAmount, currency: CURRENCY },
        }),
      recoverOnDuplicate: () => findIdByField(ctx, 'parts', 'storekeeper', 'sku', part.sku),
    });
    ids.parts[part.key] = result.id;
  }

  ctx.log('Creating parts store...');
  const store = await ensureCreated(ctx, `store:${DEMO_STORE.key}`, {
    create: () => client.post('stores', 'storekeeper', { organizationScopeId: storeScopeId, code: DEMO_STORE.code, name: DEMO_STORE.name }),
    recoverOnDuplicate: () => findIdByField(ctx, 'stores', 'storekeeper', 'code', DEMO_STORE.code),
  });
  ids.stores[DEMO_STORE.key] = store.id;

  ctx.log(`Inventory catalog ready: ${DEMO_PARTS.length} parts, 1 store.`);
}
