import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { InvoiceDto, InvoiceSummaryDto } from './dto/invoice.dto';
import { InvoicesService } from './invoices.service';

@Controller('job-cards/:jobId')
export class JobInvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Get('invoice-summary')
  @Permissions('invoices.read', 'jobs.read')
  getSummary(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ): Promise<InvoiceSummaryDto> {
    return this.service.getJobInvoiceSummary(jobId, actor);
  }

  @Post('invoices')
  @Permissions('invoices.manage')
  @HttpCode(HttpStatus.CREATED)
  regenerateInvoice(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ): Promise<InvoiceDto> {
    return this.service.regenerateJobInvoice(jobId, actor);
  }
}
