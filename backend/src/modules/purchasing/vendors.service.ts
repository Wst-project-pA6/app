import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import {
  VendorCreateDto,
  VendorListQuery,
  VendorPageResponse,
  VendorResponse,
  VendorUpdateDto,
} from './dto/vendor.dto';
import { VendorRow, VendorsRepository } from './vendors.repository';

@Injectable()
export class VendorsService {
  constructor(private readonly repo: VendorsRepository) {}

  async list(query: VendorListQuery): Promise<VendorPageResponse> {
    const { items, total } = await this.repo.list(query);
    const totalPages = Math.ceil(total / query.pageSize);
    return {
      items: items.map((r) => this.mapVendor(r)),
      page: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: total,
        totalPages,
      },
    };
  }

  async create(
    dto: VendorCreateDto,
    actor: AuthenticatedPrincipal,
  ): Promise<VendorResponse> {
    const row = await this.repo.create(dto, actor.id);
    return this.mapVendor(row);
  }

  async update(
    id: string,
    dto: VendorUpdateDto,
    actor: AuthenticatedPrincipal,
  ): Promise<VendorResponse> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Vendor not found');
    }

    if (dto.status === 'INACTIVE') {
      const hasOpen = await this.repo.hasOpenPurchaseOrders(id);
      if (hasOpen) {
        throw new AppError(
          HttpStatus.CONFLICT,
          ErrorCode.RESOURCE_IN_USE,
          'Cannot deactivate vendor with open purchase orders',
        );
      }
    }

    const updated = await this.repo.update(id, dto, actor.id);
    if (!updated) {
      throw new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Vendor not found');
    }
    return this.mapVendor(updated);
  }

  private mapVendor(row: VendorRow): VendorResponse {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      contactName: row.contact_name,
      phone: row.phone,
      email: row.email,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      createdBy: row.created_by,
      updatedBy: row.updated_by,
    };
  }
}
