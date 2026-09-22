import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AuditModule } from '../../common/audit/audit.module';
import { JobsModule } from '../jobs/jobs.module';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsRepository } from './approvals.repository';
import { ApprovalsService } from './approvals.service';

@Module({
  imports: [AccessModule, AuditModule, JobsModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsRepository, ApprovalsService],
})
export class ApprovalsModule {}
