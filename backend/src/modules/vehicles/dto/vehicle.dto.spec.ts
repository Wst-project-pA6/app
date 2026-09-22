import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateServiceReminderDto,
  CreateVehicleDto,
  MileageUnit,
  UpdateServiceReminderDto,
  UpdateVehicleDto,
} from './vehicle.dto';

const customerId = '11111111-1111-4111-8111-111111111111';

describe('vehicle DTO validation', () => {
  it('accepts contract-valid vehicle and reminder create data', async () => {
    const vehicle = plainToInstance(CreateVehicleDto, {
      customerId,
      plate: 'ABC123',
      vin: '1HGCM82633A004352',
      make: 'Honda',
      model: 'Accord',
      year: 2020,
      mileage: 100,
      mileageUnit: MileageUnit.KM,
    });
    const reminder = plainToInstance(CreateServiceReminderDto, {
      title: 'Oil service',
      dueDate: '2026-10-01',
      dueMileage: 10000,
    });
    await expect(validate(vehicle, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
    await expect(validate(reminder, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
  });

  it('rejects invalid UUID, VIN, year, mileage, and vehicle enum values', async () => {
    const dto = plainToInstance(CreateVehicleDto, {
      customerId: 'not-a-uuid',
      plate: 'A',
      vin: '1hgcm82633a004352',
      make: '',
      model: 'Accord',
      year: 1949,
      mileage: -1,
      mileageUnit: 'MILES',
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(errors)).toContain('isUuid');
    expect(JSON.stringify(errors)).toContain('matches');
    expect(JSON.stringify(errors)).toContain('isEnum');
  });

  it('enforces non-empty PATCH bodies and reminder trigger/date boundaries', async () => {
    const emptyVehicle = plainToInstance(UpdateVehicleDto, {});
    const emptyReminder = plainToInstance(UpdateServiceReminderDto, {});
    const noTrigger = plainToInstance(CreateServiceReminderDto, { title: 'Service' });
    const badDate = plainToInstance(CreateServiceReminderDto, {
      title: 'Service',
      dueDate: '2026-02-30',
    });
    const emptyVehicleErrors = await validate(emptyVehicle, { whitelist: true, forbidNonWhitelisted: true });
    const emptyReminderErrors = await validate(emptyReminder, { whitelist: true, forbidNonWhitelisted: true });
    const noTriggerErrors = await validate(noTrigger, { whitelist: true, forbidNonWhitelisted: true });
    const badDateErrors = await validate(badDate, { whitelist: true, forbidNonWhitelisted: true });

    expect(emptyVehicleErrors.length).toBeGreaterThan(0);
    expect(emptyReminderErrors.length).toBeGreaterThan(0);
    expect(noTriggerErrors.length).toBeGreaterThan(0);
    expect(badDateErrors.length).toBeGreaterThan(0);
  });

  it('rejects unknown fields and invalid reminder update status values', async () => {
    const dto = plainToInstance(UpdateServiceReminderDto, {
      title: 'Updated',
      status: 'OPEN',
      unexpected: true,
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(errors)).toContain('whitelistValidation');
    expect(JSON.stringify(errors)).toContain('isEnum');
  });
});
