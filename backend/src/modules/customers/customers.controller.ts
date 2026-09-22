import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CustomersService } from './customers.service';
import {
  CreateCustomerDto,
  CustomerListQuery,
  UpdateCustomerDto,
} from './dto/customer.dto';
import { CustomerStatementQueryDto } from '../invoices/dto/invoice.dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get()
  @Permissions('customers.read')
  list(
    @Query() query: CustomerListQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.list(query, actor);
  }

  @Post()
  @Permissions('customers.write')
  create(
    @Body() dto: CreateCustomerDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.create(dto, actor);
  }

  @Get(':customerId')
  @Permissions('customers.read')
  get(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.get(customerId, actor);
  }

  @Patch(':customerId')
  @Permissions('customers.write')
  update(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.update(customerId, dto, actor);
  }

  @Get(':customerId/statement')
  @Permissions('invoices.read')
  getStatement(
    @Param('customerId', new ParseUUIDPipe()) customerId: string,
    @Query() query: CustomerStatementQueryDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.getStatement(customerId, query, actor);
  }
}
