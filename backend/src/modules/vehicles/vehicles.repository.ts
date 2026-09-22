import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import {
  ServiceHistoryQuery,
  ServiceReminderListQuery,
  VehicleListQuery,
} from './dto/vehicle.dto';

export interface VehicleRow {
  id: string;
  customer_id: string;
  plate: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  mileage_unit: 'KM' | 'MI';
  status: 'ACTIVE' | 'ARCHIVED';
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface ServiceHistoryRow {
  job_id: string;
  job_number: string;
  service_type: 'MAINTENANCE' | 'REPAIR' | 'DIAGNOSTIC' | 'INSPECTION' | 'OTHER';
  complaint: string;
  mileage_at_intake: number;
  delivered_at: Date;
}

export interface NextServiceRow {
  reminder_id: string;
  due_date: string | null;
  due_mileage: number | null;
}

export interface ServiceReminderRow {
  id: string;
  vehicle_id: string;
  title: string;
  due_date: string | null;
  due_mileage: number | null;
  status: 'OPEN' | 'DONE' | 'CANCELLED';
  completed_at: Date | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

const VEHICLE_SELECT = `
  v.id, v.customer_id, v.plate, v.vin, v.make, v.model, v.year, v.mileage,
  v.mileage_unit, v.status, v.created_at, v.updated_at, v.created_by, v.updated_by`;

const REMINDER_SELECT = `
  r.id, r.vehicle_id, r.title, r.due_date, r.due_mileage, r.status,
  r.completed_at, r.notes, r.created_at, r.updated_at, r.created_by, r.updated_by`;

const VEHICLE_SORT_FIELDS: Record<string, string> = {
  plate: 'v.plate',
  make: 'v.make',
  createdAt: 'v.created_at',
};

const HISTORY_SORT_FIELDS: Record<string, string> = {
  deliveredAt: 'j.delivered_at',
};

const REMINDER_SORT_FIELDS: Record<string, string> = {
  dueDate: 'r.due_date',
  createdAt: 'r.created_at',
};

function orderBy(
  sort: string | undefined,
  fields: Record<string, string>,
  defaultSort: string,
  nullsLast = false,
): string {
  const requested = sort?.split(',') ?? [defaultSort];
  const clauses = requested.map((part) => {
    const descending = part.startsWith('-');
    const fieldName = descending ? part.slice(1) : part;
    const field = fields[fieldName];
    if (!field) throw new Error('INVALID_SORT');
    return `${field} ${descending ? 'DESC' : 'ASC'}${nullsLast ? ' NULLS LAST' : ''}`;
  });
  return clauses.join(', ');
}

const ACTIVE_SCOPE_JOIN = `
  JOIN customers c ON c.id = v.customer_id
  JOIN organization_scopes os ON os.id = c.organization_scope_id AND os.status = 'ACTIVE'`;

const SCOPED_VEHICLE_WHERE = 'c.organization_scope_id = ANY($1::uuid[])';
const LOOKUP_VEHICLE_SCOPE_WHERE = 'c.organization_scope_id = ANY($2::uuid[])';

@Injectable()
export class VehiclesRepository {
  constructor(private readonly db: DatabaseService) {}

  async findAccessibleCustomer(
    client: PoolClient | undefined,
    customerId: string,
    scopeIds: string[],
    lock = false,
  ): Promise<boolean> {
    const sql = `SELECT c.id
      FROM customers c
      JOIN organization_scopes os ON os.id = c.organization_scope_id AND os.status = 'ACTIVE'
      WHERE c.id = $1 AND c.organization_scope_id = ANY($2::uuid[])${lock ? ' FOR SHARE' : ''}`;
    const result = client
      ? await client.query<{ id: string }>(sql, [customerId, scopeIds])
      : await this.db.query<{ id: string }>(sql, [customerId, scopeIds]);
    return result.rowCount === 1;
  }

  async findScoped(
    vehicleId: string,
    scopeIds: string[],
    client?: PoolClient,
    lock = false,
  ): Promise<VehicleRow | null> {
    const sql = `SELECT ${VEHICLE_SELECT}
      FROM vehicles v ${ACTIVE_SCOPE_JOIN}
      WHERE v.id = $1 AND ${LOOKUP_VEHICLE_SCOPE_WHERE}${lock ? ' FOR UPDATE' : ''}`;
    const params = [vehicleId, scopeIds];
    const result = client
      ? await client.query<VehicleRow>(sql, params)
      : await this.db.query<VehicleRow>(sql, params);
    return result.rows[0] ?? null;
  }

  async create(
    client: PoolClient,
    data: {
      customerId: string;
      plate: string;
      vin: string;
      make: string;
      model: string;
      year: number;
      mileage: number;
      mileageUnit: string;
      actor: string;
    },
  ): Promise<VehicleRow> {
    const result = await client.query<VehicleRow>(
      `INSERT INTO vehicles
       (customer_id, plate, vin, make, model, year, mileage, mileage_unit, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9, $9)
       RETURNING id, customer_id, plate, vin, make, model, year, mileage, mileage_unit,
                 status, created_at, updated_at, created_by, updated_by`,
      [
        data.customerId,
        data.plate,
        data.vin,
        data.make,
        data.model,
        data.year,
        data.mileage,
        data.mileageUnit,
        data.actor,
      ],
    );
    return result.rows[0];
  }

  async update(
    client: PoolClient,
    vehicleId: string,
    values: Record<string, unknown>,
    actor: string,
  ): Promise<VehicleRow | null> {
    const entries = Object.entries(values);
    const assignments = entries
      .map(([column], index) => `${column} = $${index + 1}`)
      .join(', ');
    const actorParameter = entries.length + 1;
    const idParameter = entries.length + 2;
    const result = await client.query<VehicleRow>(
      `UPDATE vehicles
       SET ${assignments}, updated_by = $${actorParameter}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idParameter}
       RETURNING id, customer_id, plate, vin, make, model, year, mileage, mileage_unit,
                 status, created_at, updated_at, created_by, updated_by`,
      [...entries.map(([, value]) => value), actor, vehicleId],
    );
    return result.rows[0] ?? null;
  }

  async countNonDeliveredJobs(client: PoolClient, vehicleId: string): Promise<number> {
    const result = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM job_cards
       WHERE vehicle_id = $1 AND stage <> 'DELIVERED'`,
      [vehicleId],
    );
    return result.rows[0]?.count ?? 0;
  }

  async list(
    query: VehicleListQuery,
    scopeIds: string[],
  ): Promise<{ rows: VehicleRow[]; totalItems: number }> {
    const where = [SCOPED_VEHICLE_WHERE];
    const params: unknown[] = [scopeIds];
    const addCondition = (sql: string, values: unknown[]): void => {
      let rendered = sql;
      for (const value of values) {
        params.push(value);
        rendered = rendered.replace('?', `$${params.length}`);
      }
      where.push(rendered);
    };

    if (query.q) {
      const pattern = `%${query.q}%`;
      addCondition('(v.plate ILIKE ? OR v.vin ILIKE ? OR v.make ILIKE ? OR v.model ILIKE ?)', [
        pattern,
        pattern,
        pattern,
        pattern,
      ]);
    }
    if (query.customerId) addCondition('v.customer_id = ?', [query.customerId]);
    if (query.plate) addCondition('v.plate = ?', [query.plate]);
    if (query.vin) addCondition('v.vin = ?', [query.vin]);
    if (query.make) addCondition('v.make = ?', [query.make]);
    if (query.model) addCondition('v.model = ?', [query.model]);
    if (query.status) addCondition('v.status = ?', [query.status]);

    const condition = `WHERE ${where.join(' AND ')}`;
    const from = `FROM vehicles v ${ACTIVE_SCOPE_JOIN}`;
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count ${from} ${condition}`,
      params,
    );
    const limitParameter = params.length + 1;
    const offsetParameter = params.length + 2;
    const rows = await this.db.query<VehicleRow>(
      `SELECT ${VEHICLE_SELECT}
       ${from} ${condition}
       ORDER BY ${orderBy(query.sort, VEHICLE_SORT_FIELDS, 'plate')}, v.id ASC
       LIMIT $${limitParameter} OFFSET $${offsetParameter}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }

  async findLastCompletedJob(vehicleId: string): Promise<ServiceHistoryRow | null> {
    return this.db.queryOne<ServiceHistoryRow>(
      `SELECT j.id AS job_id, j.job_number, j.service_type, j.complaint,
              j.mileage_at_intake, j.delivered_at
       FROM job_cards j
       WHERE j.vehicle_id = $1 AND j.stage = 'DELIVERED'
       ORDER BY j.delivered_at DESC, j.id DESC
       LIMIT 1`,
      [vehicleId],
    );
  }

  async findNextService(vehicleId: string): Promise<NextServiceRow | null> {
    return this.db.queryOne<NextServiceRow>(
      `SELECT r.id AS reminder_id, r.due_date, r.due_mileage
       FROM service_reminders r
       WHERE r.vehicle_id = $1 AND r.status = 'OPEN'
       ORDER BY r.due_date NULLS LAST, r.due_mileage NULLS LAST, r.id ASC
       LIMIT 1`,
      [vehicleId],
    );
  }

  async listHistory(
    vehicleId: string,
    query: ServiceHistoryQuery,
  ): Promise<{ rows: ServiceHistoryRow[]; totalItems: number }> {
    const where = ["j.vehicle_id = $1", "j.stage = 'DELIVERED'"];
    const params: unknown[] = [vehicleId];
    const condition = `WHERE ${where.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM job_cards j ${condition}`,
      params,
    );
    const rows = await this.db.query<ServiceHistoryRow>(
      `SELECT j.id AS job_id, j.job_number, j.service_type, j.complaint,
              j.mileage_at_intake, j.delivered_at
       FROM job_cards j ${condition}
       ORDER BY ${orderBy(query.sort, HISTORY_SORT_FIELDS, '-deliveredAt')}, j.id DESC
       LIMIT $2 OFFSET $3`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }

  async findScopedReminder(
    reminderId: string,
    scopeIds: string[],
    client?: PoolClient,
    lock = false,
  ): Promise<ServiceReminderRow | null> {
    const sql = `SELECT ${REMINDER_SELECT}
      FROM service_reminders r
      JOIN vehicles v ON v.id = r.vehicle_id
      JOIN customers c ON c.id = v.customer_id
      JOIN organization_scopes os ON os.id = c.organization_scope_id AND os.status = 'ACTIVE'
      WHERE r.id = $1 AND c.organization_scope_id = ANY($2::uuid[])${lock ? ' FOR UPDATE' : ''}`;
    const params = [reminderId, scopeIds];
    const result = client
      ? await client.query<ServiceReminderRow>(sql, params)
      : await this.db.query<ServiceReminderRow>(sql, params);
    return result.rows[0] ?? null;
  }

  async listReminders(
    vehicleId: string,
    query: ServiceReminderListQuery,
  ): Promise<{ rows: ServiceReminderRow[]; totalItems: number }> {
    const where = ['r.vehicle_id = $1'];
    const params: unknown[] = [vehicleId];
    if (query.status) {
      params.push(query.status);
      where.push(`r.status = $${params.length}`);
    }
    const condition = `WHERE ${where.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM service_reminders r ${condition}`,
      params,
    );
    const rows = await this.db.query<ServiceReminderRow>(
      `SELECT ${REMINDER_SELECT}
       FROM service_reminders r ${condition}
       ORDER BY ${orderBy(query.sort, REMINDER_SORT_FIELDS, 'dueDate', true)}, r.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }

  async createReminder(
    client: PoolClient,
    data: {
      vehicleId: string;
      title: string;
      dueDate: string | null;
      dueMileage: number | null;
      notes: string | null;
      actor: string;
    },
  ): Promise<ServiceReminderRow> {
    const result = await client.query<ServiceReminderRow>(
      `INSERT INTO service_reminders
       (vehicle_id, title, due_date, due_mileage, status, notes, created_by, updated_by)
       VALUES ($1, $2, $3, $4, 'OPEN', $5, $6, $6)
       RETURNING id, vehicle_id, title, due_date, due_mileage, status, completed_at,
                 notes, created_at, updated_at, created_by, updated_by`,
      [data.vehicleId, data.title, data.dueDate, data.dueMileage, data.notes, data.actor],
    );
    return result.rows[0];
  }

  async updateReminder(
    client: PoolClient,
    reminderId: string,
    values: Record<string, unknown>,
    actor: string,
  ): Promise<ServiceReminderRow | null> {
    const entries = Object.entries(values);
    const assignments = entries
      .map(([column], index) => `${column} = $${index + 1}`)
      .join(', ');
    const actorParameter = entries.length + 1;
    const idParameter = entries.length + 2;
    const result = await client.query<ServiceReminderRow>(
      `UPDATE service_reminders
       SET ${assignments}, updated_by = $${actorParameter}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idParameter}
       RETURNING id, vehicle_id, title, due_date, due_mileage, status, completed_at,
                 notes, created_at, updated_at, created_by, updated_by`,
      [...entries.map(([, value]) => value), actor, reminderId],
    );
    return result.rows[0] ?? null;
  }
}
