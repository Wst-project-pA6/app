import { HttpStatus, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import {
  VendorCreateDto,
  VendorListQuery,
  VendorUpdateDto,
} from './dto/vendor.dto';

export interface VendorRow {
  id: string;
  code: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

@Injectable()
export class VendorsRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(dto: VendorCreateDto, actorId: string): Promise<VendorRow> {
    try {
      const result = await this.db.getPool().query<VendorRow>(
        `INSERT INTO vendors (code, name, contact_name, phone, email, status, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $6)
         RETURNING id, code, name, contact_name, phone, email, status, created_at, updated_at, created_by, updated_by`,
        [dto.code, dto.name, dto.contactName ?? null, dto.phone ?? null, dto.email ?? null, actorId],
      );
      return result.rows[0];
    } catch (err: unknown) {
      const error = err as { code?: string; constraint?: string };
      if (error.code === '23505' && error.constraint === 'uq_vendor_code') {
        throw new AppError(
          HttpStatus.CONFLICT,
          ErrorCode.DUPLICATE_RESOURCE,
          `Vendor with code '${dto.code}' already exists`,
        );
      }
      throw err;
    }
  }

  async findById(id: string, client?: PoolClient): Promise<VendorRow | null> {
    const q = client ?? this.db.getPool();
    const result = await q.query<VendorRow>(
      `SELECT id, code, name, contact_name, phone, email, status, created_at, updated_at, created_by, updated_by
       FROM vendors
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async list(query: VendorListQuery): Promise<{ items: VendorRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (query.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(query.status);
    }

    if (query.query) {
      conditions.push(`(name ILIKE $${paramIndex} OR code ILIKE $${paramIndex} OR contact_name ILIKE $${paramIndex})`);
      params.push(`%${query.query}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count
    const countResult = await this.db.getPool().query<{ count: string }>(
      `SELECT COUNT(*) as count FROM vendors ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Sorting: name, code, createdAt
    let orderBy = 'name ASC';
    if (query.sort) {
      const sortField = query.sort.startsWith('-') ? query.sort.substring(1) : query.sort;
      const direction = query.sort.startsWith('-') ? 'DESC' : 'ASC';
      if (['name', 'code', 'createdAt'].includes(sortField)) {
        const col = sortField === 'createdAt' ? 'created_at' : sortField;
        orderBy = `${col} ${direction}`;
      }
    }

    const offset = (query.page - 1) * query.pageSize;
    const limit = query.pageSize;

    const listResult = await this.db.getPool().query<VendorRow>(
      `SELECT id, code, name, contact_name, phone, email, status, created_at, updated_at, created_by, updated_by
       FROM vendors
       ${whereClause}
       ORDER BY ${orderBy}, id ASC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    return {
      items: listResult.rows,
      total,
    };
  }

  async update(
    id: string,
    dto: VendorUpdateDto,
    actorId: string,
    client?: PoolClient,
  ): Promise<VendorRow | null> {
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (dto.name !== undefined) {
      updates.push(`name = $${paramIdx++}`);
      params.push(dto.name);
    }
    if (dto.contactName !== undefined) {
      updates.push(`contact_name = $${paramIdx++}`);
      params.push(dto.contactName);
    }
    if (dto.phone !== undefined) {
      updates.push(`phone = $${paramIdx++}`);
      params.push(dto.phone);
    }
    if (dto.email !== undefined) {
      updates.push(`email = $${paramIdx++}`);
      params.push(dto.email);
    }
    if (dto.status !== undefined) {
      updates.push(`status = $${paramIdx++}`);
      params.push(dto.status);
    }

    if (updates.length === 0) {
      return this.findById(id, client);
    }

    updates.push(`updated_at = NOW()`);
    updates.push(`updated_by = $${paramIdx++}`);
    params.push(actorId);

    const q = client ?? this.db.getPool();
    const result = await q.query<VendorRow>(
      `UPDATE vendors
       SET ${updates.join(', ')}
       WHERE id = $${paramIdx}
       RETURNING id, code, name, contact_name, phone, email, status, created_at, updated_at, created_by, updated_by`,
      [...params, id],
    );

    return result.rows[0] ?? null;
  }

  async hasOpenPurchaseOrders(vendorId: string, client?: PoolClient): Promise<boolean> {
    const q = client ?? this.db.getPool();
    const result = await q.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM purchase_orders
         WHERE vendor_id = $1
           AND status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_RECEIVED')
       ) as exists`,
      [vendorId],
    );
    return result.rows[0].exists;
  }
}
