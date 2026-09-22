import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { TransactionService } from '../../common/database/transaction.service';
import { ScopeService } from '../../common/auth/scope.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import {
  ContactPreferencesDto,
  CreateCustomerDto,
  CustomerListQuery,
  CustomerStatus,
  UpdateCustomerDto,
} from './dto/customer.dto';
import { CustomerRow, CustomersRepository } from './customers.repository';
import { CustomerStatementQueryDto } from '../invoices/dto/invoice.dto';
import { InvoicesService } from '../invoices/invoices.service';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const badRequest = (message: string): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

const resourceInUse = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.RESOURCE_IN_USE, 'Resource in use');

function mapConstraintError(error: unknown): never {
  if ((error as { code?: string })?.code === '23505') {
    throw new AppError(
      HttpStatus.CONFLICT,
      ErrorCode.DUPLICATE_RESOURCE,
      'Duplicate resource',
    );
  }
  throw error;
}

function mapContactPreferences(row: CustomerRow): Record<string, string> | undefined {
  const preferences: Record<string, string> = {};
  if (row.preferred_channel) preferences.preferredChannel = row.preferred_channel;
  if (row.preferred_locale) preferences.preferredLocale = row.preferred_locale;
  return Object.keys(preferences).length > 0 ? preferences : undefined;
}

function mapCustomer(row: CustomerRow) {
  const contactPreferences = mapContactPreferences(row);
  return {
    id: row.id,
    organizationScopeId: row.organization_scope_id,
    displayName: row.display_name,
    type: row.type,
    phone: row.phone,
    ...(row.email !== null ? { email: row.email } : {}),
    ...(contactPreferences ? { contactPreferences } : {}),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.created_by ? { createdBy: row.created_by } : {}),
    ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
  };
}

function validateSort(sort?: string): void {
  if (!sort) return;
  const fields = new Set(['displayName', 'createdAt']);
  for (const part of sort.split(',')) {
    const field = part.startsWith('-') ? part.slice(1) : part;
    if (!fields.has(field)) throw badRequest('Unknown sort field');
  }
}

function contactValues(preferences?: ContactPreferencesDto) {
  return {
    preferredChannel: preferences?.preferredChannel ?? null,
    preferredLocale: preferences?.preferredLocale ?? null,
  };
}

function databaseContactValues(preferences: ContactPreferencesDto) {
  return {
    preferred_channel: preferences.preferredChannel ?? null,
    preferred_locale: preferences.preferredLocale ?? null,
  };
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly repository: CustomersRepository,
    private readonly transaction: TransactionService,
    private readonly scopeService: ScopeService,
    @Optional() private readonly invoicesService?: InvoicesService,
  ) {}

  async list(query: CustomerListQuery, actor: AuthenticatedPrincipal) {
    validateSort(query.sort);
    const result = await this.repository.list(
      query,
      this.scopeService.allowedScopeIds(actor),
    );
    return {
      items: result.rows.map(mapCustomer),
      page: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / query.pageSize),
      },
    };
  }

  async create(dto: CreateCustomerDto, actor: AuthenticatedPrincipal) {
    this.scopeService.assertScope(actor, dto.organizationScopeId);
    try {
      const customer = await this.transaction.runInTransaction(async (client) => {
        if (!(await this.repository.findActiveScope(client, dto.organizationScopeId))) {
          throw notFound();
        }
        return this.repository.create(client, {
          organizationScopeId: dto.organizationScopeId,
          displayName: dto.displayName,
          type: dto.type,
          phone: dto.phone,
          email: dto.email ?? null,
          ...contactValues(dto.contactPreferences),
          actor: actor.id,
        });
      });
      return mapCustomer(customer);
    } catch (error) {
      return mapConstraintError(error);
    }
  }

  async get(id: string, actor: AuthenticatedPrincipal) {
    const customer = await this.repository.findScoped(
      id,
      this.scopeService.allowedScopeIds(actor),
    );
    if (!customer) throw notFound();
    return mapCustomer(customer);
  }

  async update(
    id: string,
    dto: UpdateCustomerDto,
    actor: AuthenticatedPrincipal,
  ) {
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw badRequest('At least one property is required');
    }

    const scopeIds = this.scopeService.allowedScopeIds(actor);
    const customer = await this.transaction.runInTransaction(async (client) => {
      const current = await this.repository.findScoped(id, scopeIds, client, true);
      if (!current) throw notFound();

      if (dto.status === CustomerStatus.ARCHIVED && current.status !== CustomerStatus.ARCHIVED) {
        if ((await this.repository.countNonDeliveredJobs(client, id)) > 0) {
          throw resourceInUse();
        }
      }

      const values: Record<string, unknown> = {};
      if (dto.displayName !== undefined) values.display_name = dto.displayName;
      if (dto.phone !== undefined) values.phone = dto.phone;
      if (dto.email !== undefined) values.email = dto.email;
      if (dto.contactPreferences !== undefined) {
        Object.assign(values, databaseContactValues(dto.contactPreferences));
      }
      if (dto.status !== undefined) values.status = dto.status;

      const updated = await this.repository.update(client, id, values, actor.id);
      if (!updated) throw notFound();
      return updated;
    });
    return mapCustomer(customer);
  }

  async getStatement(
    customerId: string,
    query: CustomerStatementQueryDto,
    actor: AuthenticatedPrincipal,
  ) {
    if (!this.invoicesService) {
      throw new Error('InvoicesService not available');
    }
    return this.invoicesService.getCustomerStatement(customerId, query, actor);
  }
}
