/**
 * Deterministic synthetic demo dataset. Every identifier here (emails, codes, SKUs, VINs,
 * plates) is stable across runs — that stability, combined with the manifest in manifest.ts, is
 * what makes `npm run seed` idempotent. Nothing in this file is real customer, vendor, or
 * personal data; see docs/DEMO_SEED.md for the sourcing/licensing note on the generated photos.
 *
 * Every email uses the @demo.wst.local domain and every code/SKU/VIN uses a DEMO- or WST0-
 * prefix so `npm run seed:reset` can find and remove exactly (and only) these rows.
 */

export const DEMO_EMAIL_DOMAIN = 'demo.wst.local';
export const DEMO_PASSWORD = 'DemoPass!2026Seed';

export type RoleCode =
  | 'SYSTEM_ADMIN'
  | 'WORKSHOP_MANAGER'
  | 'SERVICE_ADVISOR'
  | 'TECHNICIAN'
  | 'QUALITY_CHECKER'
  | 'STOREKEEPER_PROCUREMENT'
  | 'MENTOR'
  | 'TRAINING_SUPERVISOR'
  | 'STUDENT'
  | 'FINANCE_VIEWER_AUDITOR';

export interface DemoUserFixture {
  key: string;
  email: string;
  displayName: string;
  preferredLocale: 'en' | 'ar';
  role: RoleCode;
}

function user(key: string, displayName: string, role: RoleCode, locale: 'en' | 'ar' = 'en'): DemoUserFixture {
  return { key, email: `demo.${key}@${DEMO_EMAIL_DOMAIN}`, displayName, role, preferredLocale: locale };
}

/** [0] and [1] are used, in order, to bootstrap the very first SYSTEM_ADMIN — see bootstrap-admin.ts. */
export const DEMO_USERS: DemoUserFixture[] = [
  user('admin', 'Nadia Fathy', 'SYSTEM_ADMIN'),
  user('manager', 'Karim El-Sayed', 'WORKSHOP_MANAGER'),
  user('advisor', 'Yasmin Adel', 'SERVICE_ADVISOR'),
  user('tech1', 'Omar Rageh', 'TECHNICIAN'),
  user('tech2', 'Hassan Tawfik', 'TECHNICIAN'),
  user('qc', 'Salma Nabil', 'QUALITY_CHECKER'),
  user('storekeeper', 'Mostafa Younes', 'STOREKEEPER_PROCUREMENT'),
  user('mentor', 'Dina Kamel', 'MENTOR'),
  user('supervisor', 'Ahmed Zaki', 'TRAINING_SUPERVISOR'),
  user('student1', 'Laila Mansour', 'STUDENT'),
  user('student2', 'Youssef Badawy', 'STUDENT'),
  user('finance', 'Rania Fouad', 'FINANCE_VIEWER_AUDITOR'),
];

export const bootstrapAdmin = DEMO_USERS[0];
export const bootstrapActor = DEMO_USERS[1];

export interface ScopeFixture {
  key: string;
  code: string;
  name: string;
  type: 'BRANCH' | 'STORE' | 'TRAINING_PROGRAM';
}

export const DEMO_SCOPES: ScopeFixture[] = [
  { key: 'branch1', code: 'DEMO-BR-01', name: 'Downtown Workshop', type: 'BRANCH' },
  { key: 'branch2', code: 'DEMO-BR-02', name: 'Airport Road Workshop', type: 'BRANCH' },
  { key: 'store', code: 'DEMO-ST-01', name: 'Main Parts Store', type: 'STORE' },
  { key: 'training', code: 'DEMO-TP-01', name: 'Automotive Technician Program', type: 'TRAINING_PROGRAM' },
];

export interface CustomerFixture {
  key: string;
  displayName: string;
  type: 'INDIVIDUAL' | 'BUSINESS';
  phone: string;
  email: string;
}

export const DEMO_CUSTOMERS: CustomerFixture[] = [
  { key: 'cust1', displayName: 'Ahmed Hassan', type: 'INDIVIDUAL', phone: '+201000000001', email: 'ahmed.hassan@demo-customer.wst.local' },
  { key: 'cust2', displayName: 'Mona Ibrahim', type: 'INDIVIDUAL', phone: '+201000000002', email: 'mona.ibrahim@demo-customer.wst.local' },
  { key: 'cust3', displayName: 'Cairo Logistics LLC', type: 'BUSINESS', phone: '+201000000003', email: 'fleet@demo-customer.wst.local' },
  { key: 'cust4', displayName: 'Tarek Naguib', type: 'INDIVIDUAL', phone: '+201000000004', email: 'tarek.naguib@demo-customer.wst.local' },
];

export interface VehicleFixture {
  key: string;
  customerKey: string;
  plate: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  colors: { background: { r: number; g: number; b: number }; body: { r: number; g: number; b: number } };
}

export const DEMO_VEHICLES: VehicleFixture[] = [
  { key: 'veh1', customerKey: 'cust1', plate: 'DEMO-001', vin: 'WST00000000000001', make: 'Toyota', model: 'Corolla', year: 2021, mileage: 42000, colors: { background: { r: 235, g: 240, b: 245 }, body: { r: 40, g: 90, b: 200 } } },
  { key: 'veh2', customerKey: 'cust2', plate: 'DEMO-002', vin: 'WST00000000000002', make: 'Hyundai', model: 'Elantra', year: 2020, mileage: 58000, colors: { background: { r: 235, g: 240, b: 245 }, body: { r: 200, g: 40, b: 40 } } },
  { key: 'veh3', customerKey: 'cust3', plate: 'DEMO-003', vin: 'WST00000000000003', make: 'Kia', model: 'Sportage', year: 2022, mileage: 21000, colors: { background: { r: 235, g: 240, b: 245 }, body: { r: 60, g: 150, b: 70 } } },
  { key: 'veh4', customerKey: 'cust3', plate: 'DEMO-004', vin: 'WST00000000000004', make: 'Toyota', model: 'Hilux', year: 2019, mileage: 91000, colors: { background: { r: 235, g: 240, b: 245 }, body: { r: 120, g: 120, b: 120 } } },
  { key: 'veh5', customerKey: 'cust4', plate: 'DEMO-005', vin: 'WST00000000000005', make: 'Chevrolet', model: 'Optra', year: 2018, mileage: 103000, colors: { background: { r: 235, g: 240, b: 245 }, body: { r: 230, g: 190, b: 40 } } },
];

export interface BayFixture {
  key: string;
  code: string;
  name: string;
  capacity: number;
}

export const DEMO_BAYS: BayFixture[] = [
  { key: 'bay1', code: 'DEMO-BAY-01', name: 'Bay 1 - General Service', capacity: 1 },
  { key: 'bay2', code: 'DEMO-BAY-02', name: 'Bay 2 - Diagnostics', capacity: 1 },
  { key: 'bay3', code: 'DEMO-BAY-03', name: 'Bay 3 - Heavy Repair', capacity: 2 },
];

export interface PartFixture {
  key: string;
  sku: string;
  nameEn: string;
  category: string;
  unitOfMeasure: string;
  sellingPriceAmount: string;
}

export const DEMO_PARTS: PartFixture[] = [
  { key: 'oil-filter', sku: 'DEMO-PART-001', nameEn: 'Oil Filter', category: 'Filters', unitOfMeasure: 'EA', sellingPriceAmount: '120.0000' },
  { key: 'air-filter', sku: 'DEMO-PART-002', nameEn: 'Air Filter', category: 'Filters', unitOfMeasure: 'EA', sellingPriceAmount: '180.0000' },
  { key: 'brake-pads-front', sku: 'DEMO-PART-003', nameEn: 'Brake Pads (Front Set)', category: 'Brakes', unitOfMeasure: 'SET', sellingPriceAmount: '650.0000' },
  { key: 'brake-pads-rear', sku: 'DEMO-PART-004', nameEn: 'Brake Pads (Rear Set)', category: 'Brakes', unitOfMeasure: 'SET', sellingPriceAmount: '580.0000' },
  { key: 'engine-oil', sku: 'DEMO-PART-005', nameEn: 'Engine Oil 5W-30', category: 'Fluids', unitOfMeasure: 'L', sellingPriceAmount: '350.0000' },
  { key: 'spark-plug', sku: 'DEMO-PART-006', nameEn: 'Spark Plug', category: 'Ignition', unitOfMeasure: 'EA', sellingPriceAmount: '95.0000' },
];

export const DEMO_STORE = { key: 'store1', code: 'DEMO-STORE-01', name: 'Main Parts Store' };

export interface VendorFixture {
  key: string;
  code: string;
  name: string;
  phone: string;
  email: string;
}

export const DEMO_VENDORS: VendorFixture[] = [
  { key: 'vendor1', code: 'DEMO-VEND-01', name: 'AutoParts Egypt Trading', phone: '+201000000101', email: 'sales@demo-vendor.wst.local' },
  { key: 'vendor2', code: 'DEMO-VEND-02', name: 'Cairo Motor Spares', phone: '+201000000102', email: 'orders@demo-vendor.wst.local' },
];

export const CURRENCY = 'EGP';
