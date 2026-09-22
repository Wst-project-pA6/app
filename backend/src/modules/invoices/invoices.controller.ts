import {
  Body,
  Controller,
  Get,
  Headers,
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
  InvoiceDto,
  InvoiceListQuery,
  InvoicePageDto,
  InvoiceTransitionRequestDto,
  InvoiceUpdateRequestDto,
  PaymentCreateRequestDto,
  PaymentReferenceDto,
} from './dto/invoice.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Get()
  @Permissions('invoices.read')
  list(
    @Query() query: InvoiceListQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ): Promise<InvoicePageDto> {
    return this.service.listInvoices(query, actor);
  }

  @Get(':invoiceId')
  @Permissions('invoices.read')
  get(
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ): Promise<InvoiceDto> {
    return this.service.getInvoice(invoiceId, actor);
  }

  @Patch(':invoiceId')
  @Permissions('invoices.manage')
  update(
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
    @Body() dto: InvoiceUpdateRequestDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ): Promise<InvoiceDto> {
    return this.service.updateInvoice(invoiceId, dto, actor);
  }

  @Post(':invoiceId/transitions')
  @Permissions('invoices.manage')
  @HttpCode(HttpStatus.OK)
  transition(
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
    @Body() dto: InvoiceTransitionRequestDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ): Promise<InvoiceDto> {
    return this.service.transitionInvoice(invoiceId, dto, actor);
  }

  @Post(':invoiceId/payments')
  @Permissions('payments.record')
  @HttpCode(HttpStatus.CREATED)
  recordPayment(
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
    @Body() dto: PaymentCreateRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ): Promise<PaymentReferenceDto> {
    return this.service.recordPayment(invoiceId, dto, idempotencyKey, actor);
  }
}
