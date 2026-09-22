import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AuditModule } from '../../common/audit/audit.module';
import { DatabaseModule } from '../../common/database/database.module';
import { RequestContextModule } from '../../common/request-context/request-context.module';
import { InvoicesController } from './invoices.controller';
import { JobInvoicesController } from './job-invoices.controller';
import { InvoicesRepository } from './invoices.repository';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [
    DatabaseModule,
    RequestContextModule,
    AuditModule,
    AccessModule,
  ],
  controllers: [InvoicesController, JobInvoicesController],
  providers: [InvoicesRepository, InvoicesService],
  exports: [InvoicesRepository, InvoicesService],
})
export class InvoicesModule {}
