import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CreatePartDto, PartListQuery, PartStatus, UpdatePartDto } from './dto/part.dto';
import { CompatibilityRow, PartRow, PartsRepository } from './parts.repository';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const badRequest = (message: string): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

const versionConflict = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.VERSION_CONFLICT, 'Version conflict');

const resourceInUse = (message: string): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.RESOURCE_IN_USE, message);

function validateSort(sort?: string): void {
  if (!sort) return;
  const allowed = new Set(['sku', 'name', 'category', 'createdAt']);
  for (const part of sort.split(',')) {
    const field = part.startsWith('-') ? part.slice(1) : part;
    if (!allowed.has(field)) {
      throw badRequest('Unknown sort field');
    }
  }
}

function mapPart(row: PartRow, compatibilities: CompatibilityRow[] = []) {
  return {
    id: row.id,
    sku: row.sku,
    ...(row.barcode ? { barcode: row.barcode } : {}),
    name: {
      en: row.name_en,
      ...(row.name_ar ? { ar: row.name_ar } : {}),
    },
    category: row.category,
    unitOfMeasure: row.unit_of_measure,
    sellingPrice: {
      amount: String(row.selling_price_amount),
      currency: row.selling_price_currency,
    },
    compatibility: compatibilities.map((c) => ({
      make: c.make,
      ...(c.model !== null && c.model !== undefined ? { model: c.model } : {}),
      ...(c.year_from !== null && c.year_from !== undefined ? { yearFrom: c.year_from } : {}),
      ...(c.year_to !== null && c.year_to !== undefined ? { yearTo: c.year_to } : {}),
    })),
    status: row.status,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.created_by ? { createdBy: row.created_by } : {}),
    ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
  };
}

function mapPage<T>(query: { page: number; pageSize: number }, rows: T[], totalItems: number) {
  return {
    items: rows,
    page: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}

function mapConstraintError(error: unknown): never {
  const databaseError = error as { code?: string; constraint?: string };
  if (databaseError?.code === '23505') {
    if (databaseError.constraint === 'uq_parts_sku') {
      throw new AppError(HttpStatus.CONFLICT, ErrorCode.DUPLICATE_RESOURCE, 'Duplicate part SKU');
    }
    if (databaseError.constraint === 'uq_parts_barcode') {
      throw new AppError(HttpStatus.CONFLICT, ErrorCode.DUPLICATE_RESOURCE, 'Duplicate part barcode');
    }
  }
  throw error;
}

@Injectable()
export class PartsService {
  constructor(
    private readonly repository: PartsRepository,
    private readonly transaction: TransactionService,
    private readonly audit: AuditService,
  ) {}

  async list(query: PartListQuery) {
    validateSort(query.sort);
    const result = await this.repository.list(query);
    const partIds = result.rows.map((r) => r.id);
    const compatGrouped = await this.repository.findCompatibilitiesByPartIds(undefined, partIds);
    return mapPage(
      query,
      result.rows.map((row) => mapPart(row, compatGrouped[row.id] ?? [])),
      result.totalItems,
    );
  }

  async get(partId: string) {
    const part = await this.repository.findById(undefined, partId);
    if (!part) throw notFound();
    const compatibilities = await this.repository.findCompatibilitiesByPartId(undefined, partId);
    return mapPart(part, compatibilities);
  }

  async create(dto: CreatePartDto, actor: AuthenticatedPrincipal) {
    try {
      const result = await this.transaction.runInTransaction(async (client) => {
        const part = await this.repository.create(client, {
          sku: dto.sku,
          barcode: dto.barcode,
          nameEn: dto.name.en,
          nameAr: dto.name.ar,
          category: dto.category,
          unitOfMeasure: dto.unitOfMeasure,
          sellingPriceAmount: dto.sellingPrice.amount,
          sellingPriceCurrency: dto.sellingPrice.currency,
          actor: actor.id,
        });

        let compatibilities: CompatibilityRow[] = [];
        if (dto.compatibility && dto.compatibility.length > 0) {
          compatibilities = await this.repository.insertCompatibilities(
            client,
            part.id,
            dto.compatibility,
          );
        }

        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'PART.CREATE',
          entityType: 'PART',
          entityId: part.id,
          outcome: 'SUCCESS',
          summary: `Created part ${part.sku}`,
        });

        return { part, compatibilities };
      });

      return mapPart(result.part, result.compatibilities);
    } catch (error) {
      return mapConstraintError(error);
    }
  }

  async update(partId: string, dto: UpdatePartDto, actor: AuthenticatedPrincipal) {
    const hasUpdatable = Object.entries(dto).some(
      ([key, val]) => key !== 'version' && val !== undefined,
    );
    if (!hasUpdatable) {
      throw badRequest('At least one property is required');
    }

    try {
      const result = await this.transaction.runInTransaction(async (client) => {
        const current = await this.repository.findById(client, partId, true);
        if (!current) throw notFound();

        if (current.version !== dto.version) {
          throw versionConflict();
        }

        if (dto.status === PartStatus.ARCHIVED) {
          const hasStock = await this.repository.hasOnHandStock(client, partId);
          const hasOpenPo = await this.repository.hasOpenPurchaseOrder(client, partId);
          if (hasStock || hasOpenPo) {
            throw resourceInUse(
              'Part cannot be archived while stock remains on hand or open purchase orders exist',
            );
          }
        }

        const values: Record<string, unknown> = {};
        if (dto.barcode !== undefined) values.barcode = dto.barcode;
        if (dto.name?.en !== undefined) values.name_en = dto.name.en;
        if (dto.name?.ar !== undefined) values.name_ar = dto.name.ar;
        if (dto.category !== undefined) values.category = dto.category;
        if (dto.sellingPrice?.amount !== undefined) {
          values.selling_price_amount = dto.sellingPrice.amount;
        }
        if (dto.sellingPrice?.currency !== undefined) {
          values.selling_price_currency = dto.sellingPrice.currency;
        }
        if (dto.status !== undefined) values.status = dto.status;

        const updated = await this.repository.update(
          client,
          partId,
          dto.version,
          values,
          actor.id,
        );
        if (!updated) throw versionConflict();

        let compatibilities: CompatibilityRow[];
        if (dto.compatibility !== undefined) {
          compatibilities = await this.repository.replaceCompatibilities(
            client,
            partId,
            dto.compatibility,
          );
        } else {
          compatibilities = await this.repository.findCompatibilitiesByPartId(client, partId);
        }

        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'PART.UPDATE',
          entityType: 'PART',
          entityId: partId,
          outcome: 'SUCCESS',
          summary: `Updated part ${updated.sku}`,
        });

        return { part: updated, compatibilities };
      });

      return mapPart(result.part, result.compatibilities);
    } catch (error) {
      return mapConstraintError(error);
    }
  }
}
