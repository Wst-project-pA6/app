import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CreateStoreDto, StoreListQuery, StoreStatus, UpdateStoreDto } from './dto/store.dto';
import { StoreRow, StoresRepository } from './stores.repository';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const badRequest = (message: string): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

const resourceInUse = (message: string): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.RESOURCE_IN_USE, message);

function validateSort(sort?: string): void {
  if (!sort) return;
  const allowed = new Set(['code', 'name']);
  for (const part of sort.split(',')) {
    const field = part.startsWith('-') ? part.slice(1) : part;
    if (!allowed.has(field)) {
      throw badRequest('Unknown sort field');
    }
  }
}

function mapStore(row: StoreRow) {
  return {
    id: row.id,
    organizationScopeId: row.organization_scope_id,
    code: row.code,
    name: row.name,
    status: row.status,
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
  if (databaseError?.code === '23505' && databaseError.constraint === 'uq_store_code') {
    throw new AppError(HttpStatus.CONFLICT, ErrorCode.DUPLICATE_RESOURCE, 'Store code already exists');
  }
  throw error;
}

@Injectable()
export class StoresService {
  constructor(
    private readonly repository: StoresRepository,
    private readonly transaction: TransactionService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async list(query: StoreListQuery, actor: AuthenticatedPrincipal) {
    validateSort(query.sort);
    const result = await this.repository.list(query, this.scopeService.allowedScopeIds(actor));
    return mapPage(query, result.rows.map(mapStore), result.totalItems);
  }

  async create(dto: CreateStoreDto, actor: AuthenticatedPrincipal) {
    this.scopeService.assertScope(actor, dto.organizationScopeId);
    try {
      const store = await this.transaction.runInTransaction(async (client) => {
        const activeScope = await this.repository.findActiveScope(client, dto.organizationScopeId);
        if (!activeScope) throw notFound();

        const created = await this.repository.create(client, {
          organizationScopeId: dto.organizationScopeId,
          code: dto.code,
          name: dto.name,
          actor: actor.id,
        });

        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'STORE.CREATE',
          entityType: 'STORE',
          entityId: created.id,
          outcome: 'SUCCESS',
          summary: `Created store ${created.code}`,
        });

        return created;
      });
      return mapStore(store);
    } catch (error) {
      return mapConstraintError(error);
    }
  }

  async update(storeId: string, dto: UpdateStoreDto, actor: AuthenticatedPrincipal) {
    const hasProperty = Object.values(dto).some((value) => value !== undefined);
    if (!hasProperty) {
      throw badRequest('At least one property is required');
    }

    const scopes = this.scopeService.allowedScopeIds(actor);
    try {
      const store = await this.transaction.runInTransaction(async (client) => {
        const current = await this.repository.findScoped(storeId, scopes, client, true);
        if (!current) throw notFound();

        if (dto.status === StoreStatus.INACTIVE) {
          const inUse = await this.repository.hasOnHandOrReservedStock(client, storeId);
          if (inUse) {
            throw resourceInUse('Store cannot be deactivated while balances have on-hand or reserved stock');
          }
        }

        const values: Record<string, unknown> = {};
        if (dto.name !== undefined) values.name = dto.name;
        if (dto.status !== undefined) values.status = dto.status;

        const updated = await this.repository.update(client, storeId, values, actor.id);
        if (!updated) throw notFound();

        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'STORE.UPDATE',
          entityType: 'STORE',
          entityId: storeId,
          outcome: 'SUCCESS',
          summary: `Updated store ${updated.code}`,
        });

        return updated;
      });
      return mapStore(store);
    } catch (error) {
      return mapConstraintError(error);
    }
  }
}
