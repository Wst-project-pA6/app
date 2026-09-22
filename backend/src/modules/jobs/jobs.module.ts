import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AuditModule } from '../../common/audit/audit.module';
import { JobsController } from './jobs.controller';
import { JobsRepository } from './jobs.repository';
import { JobsService } from './jobs.service';

@Module({
  imports: [AccessModule, AuditModule],
  controllers: [JobsController],
  providers: [JobsRepository, JobsService],
  exports: [JobsRepository],
})
export class JobsModule {}
