import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import {
  VendorCreateDto,
  VendorListQuery,
  VendorPageResponse,
  VendorResponse,
  VendorUpdateDto,
} from './dto/vendor.dto';
import { VendorsService } from './vendors.service';

@Controller('vendors')
export class VendorsController {
  constructor(private readonly service: VendorsService) {}

  @Get()
  @Permissions('vendors.read')
  list(@Query() query: VendorListQuery): Promise<VendorPageResponse> {
    return this.service.list(query);
  }

  @Post()
  @Permissions('vendors.write')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: VendorCreateDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ): Promise<VendorResponse> {
    return this.service.create(dto, actor);
  }

  @Patch(':vendorId')
  @Permissions('vendors.write')
  update(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @Body() dto: VendorUpdateDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ): Promise<VendorResponse> {
    return this.service.update(vendorId, dto, actor);
  }
}
