import { SeedContext } from '../context';
import { ensureCreated, findIdByField, isDone, markDone } from '../idempotent';
import { CURRENCY, DEMO_VENDORS } from '../fixtures';

const PO_LINES: Array<{ partKey: string; quantityOrdered: number; unitCost: string }> = [
  { partKey: 'oil-filter', quantityOrdered: 20, unitCost: '80.0000' },
  { partKey: 'air-filter', quantityOrdered: 15, unitCost: '120.0000' },
  { partKey: 'brake-pads-front', quantityOrdered: 10, unitCost: '420.0000' },
  { partKey: 'brake-pads-rear', quantityOrdered: 10, unitCost: '380.0000' },
  { partKey: 'engine-oil', quantityOrdered: 25, unitCost: '220.0000' },
  { partKey: 'spark-plug', quantityOrdered: 40, unitCost: '55.0000' },
];

const STOCK_LEVELS: Array<{ partKey: string; minLevel: number; maxLevel: number }> = [
  { partKey: 'oil-filter', minLevel: 5, maxLevel: 40 },
  { partKey: 'brake-pads-front', minLevel: 2, maxLevel: 20 },
  { partKey: 'engine-oil', minLevel: 10, maxLevel: 60 },
];

export async function seedPurchasing(ctx: SeedContext): Promise<void> {
  const { client, ids } = ctx;

  ctx.log('Creating vendors...');
  for (const vendor of DEMO_VENDORS) {
    const result = await ensureCreated(ctx, `vendor:${vendor.key}`, {
      create: () => client.post('vendors', 'storekeeper', { code: vendor.code, name: vendor.name, phone: vendor.phone, email: vendor.email }),
      recoverOnDuplicate: () => findIdByField(ctx, 'vendors', 'storekeeper', 'code', vendor.code),
    });
    ids.vendors[vendor.key] = result.id;
  }

  const storeId = ids.stores.store1;
  const vendorId = ids.vendors.vendor1;

  ctx.log('Creating and receiving the opening-stock purchase order...');
  const poResult = await ensureCreated(ctx, 'purchase-order:opening-stock', {
    verify: async (id) => (await client.tryGet(`purchase-orders/${id}`, 'storekeeper')) !== null,
    findExisting: async () => {
      // Only one demo PO is ever created against this vendor — a reliable natural key.
      const page = await client.get('purchase-orders', 'storekeeper', { vendorId, pageSize: 1 });
      return (page.items[0]?.id as string) ?? null;
    },
    create: () =>
      client.post('purchase-orders', 'storekeeper', {
        vendorId,
        storeId,
        lines: PO_LINES.map((line) => ({
          partId: ids.parts[line.partKey],
          quantityOrdered: line.quantityOrdered,
          unitCost: { amount: line.unitCost, currency: CURRENCY },
        })),
        notes: 'Demo opening stock order',
      }),
  });
  const purchaseOrderId = poResult.id;

  if (!poResult.created) {
    // A findExisting/verify recovery only restores the top-level id, not the manifest's
    // sub-step "done" markers — reconcile them against the PO's actual current status so a
    // recovered (not freshly created) PO doesn't get re-submitted/re-approved/re-received.
    const current = await client.get(`purchase-orders/${purchaseOrderId}`, 'storekeeper');
    const status = current.status as string;
    if (['PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(status)) {
      markDone(ctx, 'purchase-order:opening-stock:submitted');
    }
    if (['APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(status)) {
      markDone(ctx, 'purchase-order:opening-stock:approved');
    }
    if (status === 'RECEIVED') markDone(ctx, 'purchase-order:opening-stock:received');
  }

  if (!isDone(ctx, 'purchase-order:opening-stock:submitted')) {
    await client.post(`purchase-orders/${purchaseOrderId}/transitions`, 'storekeeper', { toStatus: 'PENDING_APPROVAL' });
    markDone(ctx, 'purchase-order:opening-stock:submitted');
  }

  if (!isDone(ctx, 'purchase-order:opening-stock:approved')) {
    await client.post(`purchase-orders/${purchaseOrderId}/approvals`, 'manager', { decision: 'APPROVED' });
    markDone(ctx, 'purchase-order:opening-stock:approved');
  }

  if (!isDone(ctx, 'purchase-order:opening-stock:received')) {
    const purchaseOrder = await client.get(`purchase-orders/${purchaseOrderId}`, 'storekeeper');
    const lines = purchaseOrder.lines as Array<{ id: string; quantityOrdered: number }>;
    await client.post(`purchase-orders/${purchaseOrderId}/goods-receipts`, 'storekeeper', {
      deliveryReference: 'DEMO-GRN-001',
      lines: lines.map((line) => ({
        purchaseOrderLineId: line.id,
        quantityReceived: line.quantityOrdered,
        quantityAccepted: line.quantityOrdered,
        quantityRejected: 0,
      })),
    });
    markDone(ctx, 'purchase-order:opening-stock:received');
  }

  ctx.log('Setting stock min/max levels...');
  for (const level of STOCK_LEVELS) {
    const key = `stock-level:${level.partKey}`;
    if (!isDone(ctx, key)) {
      await client.put(`stock-balances/${storeId}/${ids.parts[level.partKey]}/levels`, 'storekeeper', {
        minLevel: level.minLevel,
        maxLevel: level.maxLevel,
      });
      markDone(ctx, key);
    }
  }

  ctx.log('Recording a demo stock adjustment (damage write-off, approved)...');
  const adjustmentResult = await ensureCreated(ctx, 'stock-adjustment:demo-damage', {
    findExisting: async () => {
      const page = await client.get('stock-adjustments', 'storekeeper', { storeId, partId: ids.parts['spark-plug'], pageSize: 1 });
      return (page.items[0]?.id as string) ?? null;
    },
    create: () =>
      client.post('stock-adjustments', 'storekeeper', {
        storeId,
        partId: ids.parts['spark-plug'],
        quantityDelta: -2,
        reasonCode: 'DAMAGE',
        note: 'Two spark plugs damaged in handling (demo data)',
      }),
  });
  if (!adjustmentResult.created) {
    // No single-item GET for stock-adjustments (see idempotent.ts) — reuse the same list lookup
    // findExisting used, to check whether this recovered row was already decided.
    const page = await client.get('stock-adjustments', 'storekeeper', { storeId, partId: ids.parts['spark-plug'], pageSize: 1 });
    const status = page.items[0]?.status as string | undefined;
    if (status && status !== 'PENDING') markDone(ctx, 'stock-adjustment:demo-damage:decided');
  }
  if (!isDone(ctx, 'stock-adjustment:demo-damage:decided')) {
    await client.post(`stock-adjustments/${adjustmentResult.id}/decision`, 'manager', { decision: 'APPROVED' });
    markDone(ctx, 'stock-adjustment:demo-damage:decided');
  }

  ctx.log('Purchasing/inventory pipeline ready.');
}
