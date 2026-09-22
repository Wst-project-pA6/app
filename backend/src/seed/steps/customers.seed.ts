import { SeedContext } from '../context';
import { ensureCreated } from '../idempotent';
import { DEMO_CUSTOMERS, DEMO_VEHICLES } from '../fixtures';

export async function seedCustomersAndVehicles(ctx: SeedContext): Promise<void> {
  const { client, ids } = ctx;
  const branchScopeId = ids.scopes.branch1;

  ctx.log('Creating demo customers...');
  for (const customer of DEMO_CUSTOMERS) {
    const result = await ensureCreated(ctx, `customer:${customer.key}`, {
      verify: async (id) => (await client.tryGet(`customers/${id}`, 'advisor')) !== null,
      findExisting: async () => {
        const page = await client.get('customers', 'advisor', { phone: customer.phone, pageSize: 1 });
        return (page.items[0]?.id as string) ?? null;
      },
      create: () =>
        client.post('customers', 'advisor', {
          organizationScopeId: branchScopeId,
          displayName: customer.displayName,
          type: customer.type,
          phone: customer.phone,
          email: customer.email,
          contactPreferences: { preferredChannel: 'PHONE', preferredLocale: 'en' },
        }),
    });
    ids.customers[customer.key] = result.id;
  }

  ctx.log('Creating demo vehicles...');
  for (const vehicle of DEMO_VEHICLES) {
    const result = await ensureCreated(ctx, `vehicle:${vehicle.key}`, {
      verify: async (id) => (await client.tryGet(`vehicles/${id}`, 'advisor')) !== null,
      findExisting: async () => {
        const page = await client.get('vehicles', 'advisor', { vin: vehicle.vin, pageSize: 1 });
        return (page.items[0]?.id as string) ?? null;
      },
      create: () =>
        client.post('vehicles', 'advisor', {
          customerId: ids.customers[vehicle.customerKey],
          plate: vehicle.plate,
          vin: vehicle.vin,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          mileage: vehicle.mileage,
          mileageUnit: 'KM',
        }),
    });
    ids.vehicles[vehicle.key] = result.id;
  }

  ctx.log('Creating service reminders...');
  const reminders: Array<{ key: string; vehicleKey: string; title: string; dueMileage: number }> = [
    { key: 'reminder1', vehicleKey: 'veh1', title: 'Next oil change due', dueMileage: 47000 },
    { key: 'reminder2', vehicleKey: 'veh2', title: 'Timing belt inspection due', dueMileage: 65000 },
    { key: 'reminder3', vehicleKey: 'veh5', title: 'Brake fluid replacement due', dueMileage: 108000 },
  ];
  for (const reminder of reminders) {
    const reminderKey = `reminder:${reminder.key}`;
    if (ctx.manifest.get(reminderKey) !== 'done') {
      await client.post(`vehicles/${ids.vehicles[reminder.vehicleKey]}/reminders`, 'advisor', {
        title: reminder.title,
        dueMileage: reminder.dueMileage,
      }, [200, 201]);
      ctx.manifest.set(reminderKey, 'done');
    }
  }

  ctx.log(`Customers/vehicles ready: ${DEMO_CUSTOMERS.length} customers, ${DEMO_VEHICLES.length} vehicles, ${reminders.length} reminders.`);
}
