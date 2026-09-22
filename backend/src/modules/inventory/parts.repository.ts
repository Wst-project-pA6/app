import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { PartListQuery, PartStatus, VehicleCompatibilityDto } from './dto/part.dto';

export interface PartRow {
  id: string;
  sku: string;
  barcode: string | null;
  name_en: string;
  name_ar: string | null;
  category: string;
  unit_of_measure: string;
  selling_price_amount: string;
  selling_price_currency: string;
  status: PartStatus;
  version: number;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CompatibilityRow {
  id: string;
  part_id: string;
  make: string;
  model: string | null;
  year_from: number | null;
  year_to: number | null;
}

const PART_SELECT = `
  p.id, p.sku, p.barcode, p.name_en, p.name_ar, p.category, p.unit_of_measure,
  p.selling_price_amount, p.selling_price_currency, p.status, p.version,
  p.created_at, p.updated_at, p.created_by, p.updated_by`;

const COMPAT_SELECT = `
  c.id, c.part_id, c.make, c.model, c.year_from, c.year_to`;

const PART_SORT_FIELDS: Record<string, string> = {
  sku: 'p.sku',
  name: 'p.name_en',
  category: 'p.category',
  createdAt: 'p.created_at',
};

export function orderPartsBy(sort?: string): string {
  const requested = sort ? sort.split(',') : ['sku'];
  return requested
    .map((part) => {
      const descending = part.startsWith('-');
      const fieldName = descending ? part.slice(1) : part;
      const column = PART_SORT_FIELDS[fieldName];
      if (!column) throw new Error('INVALID_SORT');
      return `${column} ${descending ? 'DESC' : 'ASC'}`;
    })
    .join(', ');
}

@Injectable()
export class PartsRepository {
  constructor(private readonly db: DatabaseService) {}

  async findById(
    client: PoolClient | undefined,
    partId: string,
    lock = false,
  ): Promise<PartRow | null> {
    const sql = `SELECT ${PART_SELECT} FROM parts p WHERE p.id = $1${lock ? ' FOR UPDATE OF p' : ''}`;
    const result = client
      ? await client.query<PartRow>(sql, [partId])
      : await this.db.query<PartRow>(sql, [partId]);
    return result.rows[0] ?? null;
  }

  async findCompatibilitiesByPartId(
    client: PoolClient | undefined,
    partId: string,
  ): Promise<CompatibilityRow[]> {
    const sql = `SELECT ${COMPAT_SELECT} FROM part_vehicle_compatibility c
                 WHERE c.part_id = $1 ORDER BY c.make ASC, c.model ASC, c.year_from ASC`;
    const result = client
      ? await client.query<CompatibilityRow>(sql, [partId])
      : await this.db.query<CompatibilityRow>(sql, [partId]);
    return result.rows;
  }

  async findCompatibilitiesByPartIds(
    client: PoolClient | undefined,
    partIds: string[],
  ): Promise<Record<string, CompatibilityRow[]>> {
    if (partIds.length === 0) return {};
    const sql = `SELECT ${COMPAT_SELECT} FROM part_vehicle_compatibility c
                 WHERE c.part_id = ANY($1::uuid[]) ORDER BY c.make ASC, c.model ASC, c.year_from ASC`;
    const result = client
      ? await client.query<CompatibilityRow>(sql, [partIds])
      : await this.db.query<CompatibilityRow>(sql, [partIds]);
    const grouped: Record<string, CompatibilityRow[]> = {};
    for (const row of result.rows) {
      if (!grouped[row.part_id]) {
        grouped[row.part_id] = [];
      }
      grouped[row.part_id].push(row);
    }
    return grouped;
  }

  async create(
    client: PoolClient,
    data: {
      sku: string;
      barcode?: string;
      nameEn: string;
      nameAr?: string;
      category: string;
      unitOfMeasure: string;
      sellingPriceAmount: string;
      sellingPriceCurrency: string;
      actor: string;
    },
  ): Promise<PartRow> {
    const result = await client.query<PartRow>(
      `INSERT INTO parts
       (sku, barcode, name_en, name_ar, category, unit_of_measure,
        selling_price_amount, selling_price_currency, status, version, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', 1, $9, $9)
       RETURNING ${PART_SELECT.replaceAll('p.', '')}`,
      [
        data.sku,
        data.barcode ?? null,
        data.nameEn,
        data.nameAr ?? null,
        data.category,
        data.unitOfMeasure,
        data.sellingPriceAmount,
        data.sellingPriceCurrency,
        data.actor,
      ],
    );
    return result.rows[0];
  }

  async insertCompatibilities(
    client: PoolClient,
    partId: string,
    compatibilities: VehicleCompatibilityDto[],
  ): Promise<CompatibilityRow[]> {
    if (compatibilities.length === 0) return [];
    const inserted: CompatibilityRow[] = [];
    for (const item of compatibilities) {
      const result = await client.query<CompatibilityRow>(
        `INSERT INTO part_vehicle_compatibility
         (part_id, make, model, year_from, year_to)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${COMPAT_SELECT.replaceAll('c.', '')}`,
        [partId, item.make, item.model ?? null, item.yearFrom ?? null, item.yearTo ?? null],
      );
      if (result.rows[0]) inserted.push(result.rows[0]);
    }
    return inserted;
  }

  async replaceCompatibilities(
    client: PoolClient,
    partId: string,
    compatibilities: VehicleCompatibilityDto[],
  ): Promise<CompatibilityRow[]> {
    await client.query(`DELETE FROM part_vehicle_compatibility WHERE part_id = $1`, [partId]);
    return this.insertCompatibilities(client, partId, compatibilities);
  }

  async update(
    client: PoolClient,
    partId: string,
    expectedVersion: number,
    values: Record<string, unknown>,
    actor: string,
  ): Promise<PartRow | null> {
    const entries = Object.entries(values);
    const assignments = entries.map(([column], index) => `${column} = $${index + 1}`).join(', ');
    const actorParam = entries.length + 1;
    const idParam = entries.length + 2;
    const versionParam = entries.length + 3;

    const sql = `UPDATE parts
       SET ${assignments ? `${assignments}, ` : ''}version = version + 1, updated_by = $${actorParam}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idParam} AND version = $${versionParam}
       RETURNING ${PART_SELECT.replaceAll('p.', '')}`;

    const result = await client.query<PartRow>(sql, [
      ...entries.map(([, val]) => val),
      actor,
      partId,
      expectedVersion,
    ]);
    return result.rows[0] ?? null;
  }

  async hasOnHandStock(client: PoolClient, partId: string): Promise<boolean> {
    const result = await client.query<{ hasOnHand: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM stock_balances
         WHERE part_id = $1 AND on_hand > 0
       ) AS "hasOnHand"`,
      [partId],
    );
    return result.rows[0]?.hasOnHand ?? false;
  }

  async hasOpenPurchaseOrder(client: PoolClient, partId: string): Promise<boolean> {
    const result = await client.query<{ hasOpenPo: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM purchase_order_lines pol
         JOIN purchase_orders po ON po.id = pol.purchase_order_id
         WHERE pol.part_id = $1 AND po.status NOT IN ('RECEIVED', 'CANCELLED', 'REJECTED')
       ) AS "hasOpenPo"`,
      [partId],
    );
    return result.rows[0]?.hasOpenPo ?? false;
  }

  async list(query: PartListQuery): Promise<{ rows: PartRow[]; totalItems: number }> {
    const where: string[] = [];
    const params: unknown[] = [];

    if (query.q) {
      params.push(`%${query.q}%`);
      const p = `$${params.length}`;
      where.push(`(p.sku ILIKE ${p} OR p.name_en ILIKE ${p} OR p.name_ar ILIKE ${p} OR p.barcode ILIKE ${p})`);
    }

    if (query.sku) {
      params.push(query.sku);
      where.push(`p.sku = $${params.length}`);
    }

    if (query.barcode) {
      params.push(query.barcode);
      where.push(`p.barcode = $${params.length}`);
    }

    if (query.category) {
      params.push(query.category);
      where.push(`p.category = $${params.length}`);
    }

    if (query.status) {
      params.push(query.status);
      where.push(`p.status = $${params.length}`);
    }

    if (query.compatibleMake && query.compatibleModel) {
      params.push(query.compatibleMake);
      const makeParam = `$${params.length}`;
      params.push(query.compatibleModel);
      const modelParam = `$${params.length}`;
      where.push(
        `EXISTS (SELECT 1 FROM part_vehicle_compatibility pvc WHERE pvc.part_id = p.id AND pvc.make ILIKE ${makeParam} AND pvc.model ILIKE ${modelParam})`,
      );
    } else if (query.compatibleMake) {
      params.push(query.compatibleMake);
      where.push(
        `EXISTS (SELECT 1 FROM part_vehicle_compatibility pvc WHERE pvc.part_id = p.id AND pvc.make ILIKE $${params.length})`,
      );
    } else if (query.compatibleModel) {
      params.push(query.compatibleModel);
      where.push(
        `EXISTS (SELECT 1 FROM part_vehicle_compatibility pvc WHERE pvc.part_id = p.id AND pvc.model ILIKE $${params.length})`,
      );
    }

    const condition = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (query.page - 1) * query.pageSize;

    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM parts p ${condition}`,
      params,
    );

    const rows = await this.db.query<PartRow>(
      `SELECT ${PART_SELECT} FROM parts p ${condition}
       ORDER BY ${orderPartsBy(query.sort)}, p.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );

    return { rows: rows.rows, totalItems: count ?? 0 };
  }
}
