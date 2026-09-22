import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import {
  PartReservationListQuery,
  PartReservationStatus,
} from './dto/part-reservation.dto';
import { StockMovementType } from './dto/stock-balance.dto';

export interface PartReservationRow {
  id: string;
  job_id: string;
  part_id: string;
  store_id: string;
  quantity: number;
  consumed_quantity: number;
  status: PartReservationStatus;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface StockBalanceLockRow {
  store_id: string;
  part_id: string;
  on_hand: number;
  reserved: number;
}

const RESERVATION_SELECT = `
  r.id, r.job_id, r.part_id, r.store_id, r.quantity, r.consumed_quantity,
  r.status, r.created_at, r.updated_at, r.created_by, r.updated_by`;

export function orderReservationsBy(sort?: string): string {
  const requested = sort ? sort.split(',') : ['createdAt'];
  return requested
    .map((part) => {
      const descending = part.startsWith('-');
      const fieldName = descending ? part.slice(1) : part;
      if (fieldName !== 'createdAt') throw new Error('INVALID_SORT');
      return `r.created_at ${descending ? 'DESC' : 'ASC'}`;
    })
    .join(', ');
}

@Injectable()
export class PartReservationsRepository {
  constructor(private readonly db: DatabaseService) {}

  async listByJobId(
    jobId: string,
    query: PartReservationListQuery,
  ): Promise<{ rows: PartReservationRow[]; totalItems: number }> {
    const where = ['r.job_id = $1'];
    const params: unknown[] = [jobId];

    if (query.status) {
      params.push(query.status);
      where.push(`r.status = $${params.length}`);
    }

    const condition = `WHERE ${where.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;

    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count
       FROM part_reservations r
       ${condition}`,
      params,
    );

    const rows = await this.db.query<PartReservationRow>(
      `SELECT ${RESERVATION_SELECT}
       FROM part_reservations r
       ${condition}
       ORDER BY ${orderReservationsBy(query.sort)}, r.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );

    return { rows: rows.rows, totalItems: count ?? 0 };
  }

  async lockBalance(
    client: PoolClient,
    storeId: string,
    partId: string,
  ): Promise<StockBalanceLockRow | null> {
    const result = await client.query<StockBalanceLockRow>(
      `SELECT store_id, part_id, on_hand, reserved
       FROM stock_balances
       WHERE store_id = $1 AND part_id = $2
       FOR UPDATE`,
      [storeId, partId],
    );
    return result.rows[0] ?? null;
  }

  async lockReservation(
    client: PoolClient,
    reservationId: string,
  ): Promise<PartReservationRow | null> {
    const result = await client.query<PartReservationRow>(
      `SELECT id, job_id, part_id, store_id, quantity, consumed_quantity, status, created_at, updated_at, created_by, updated_by
       FROM part_reservations
       WHERE id = $1
       FOR UPDATE`,
      [reservationId],
    );
    return result.rows[0] ?? null;
  }

  async createReservation(
    client: PoolClient,
    data: {
      jobId: string;
      partId: string;
      storeId: string;
      quantity: number;
      actorId: string;
    },
  ): Promise<PartReservationRow> {
    const result = await client.query<PartReservationRow>(
      `INSERT INTO part_reservations
         (job_id, part_id, store_id, quantity, consumed_quantity, status, created_by, updated_by, created_at, updated_at)
       VALUES
         ($1, $2, $3, $4, 0, 'ACTIVE', $5, $5, now(), now())
       RETURNING
         id, job_id, part_id, store_id, quantity, consumed_quantity, status, created_at, updated_at, created_by, updated_by`,
      [data.jobId, data.partId, data.storeId, data.quantity, data.actorId],
    );
    return result.rows[0];
  }

  async updateBalanceReserved(
    client: PoolClient,
    storeId: string,
    partId: string,
    delta: number,
  ): Promise<StockBalanceLockRow> {
    const result = await client.query<StockBalanceLockRow>(
      `UPDATE stock_balances
       SET reserved = reserved + $3,
           updated_at = now()
       WHERE store_id = $1 AND part_id = $2
       RETURNING store_id, part_id, on_hand, reserved`,
      [storeId, partId, delta],
    );
    return result.rows[0];
  }

  async createMovement(
    client: PoolClient,
    data: {
      storeId: string;
      partId: string;
      type: StockMovementType;
      onHandDelta: number;
      reservedDelta: number;
      onHandAfter: number;
      reservedAfter: number;
      jobId: string;
      actorId: string;
      reason?: string;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO stock_movements
         (store_id, part_id, type, on_hand_delta, reserved_delta, on_hand_after, reserved_after, job_id, actor_id, reason, occurred_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
      [
        data.storeId,
        data.partId,
        data.type,
        data.onHandDelta,
        data.reservedDelta,
        data.onHandAfter,
        data.reservedAfter,
        data.jobId,
        data.actorId,
        data.reason ?? null,
      ],
    );
  }

  async consumeReservation(
    client: PoolClient,
    reservationId: string,
    consumedDelta: number,
    actorId: string,
  ): Promise<PartReservationRow> {
    const result = await client.query<PartReservationRow>(
      `UPDATE part_reservations
       SET consumed_quantity = consumed_quantity + $2,
           status = CASE WHEN consumed_quantity + $2 >= quantity THEN 'FULFILLED' ELSE status END,
           updated_by = $3,
           updated_at = now()
       WHERE id = $1
       RETURNING
         id, job_id, part_id, store_id, quantity, consumed_quantity, status, created_at, updated_at, created_by, updated_by`,
      [reservationId, consumedDelta, actorId],
    );
    return result.rows[0];
  }

  async updateReservationStatus(
    client: PoolClient,
    reservationId: string,
    status: PartReservationStatus,
    actorId: string,
  ): Promise<PartReservationRow> {
    const result = await client.query<PartReservationRow>(
      `UPDATE part_reservations
       SET status = $2,
           updated_by = $3,
           updated_at = now()
       WHERE id = $1
       RETURNING
         id, job_id, part_id, store_id, quantity, consumed_quantity, status, created_at, updated_at, created_by, updated_by`,
      [reservationId, status, actorId],
    );
    return result.rows[0];
  }
}
