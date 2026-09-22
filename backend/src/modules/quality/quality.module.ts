import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AuditModule } from '../../common/audit/audit.module';
import { JobsModule } from '../jobs/jobs.module';
import { QualityController } from './quality.controller';
import { QualityRepository } from './quality.repository';
import { QualityService } from './quality.service';

@Module({
  imports: [AccessModule, AuditModule, JobsModule],
  controllers: [QualityController],
  providers: [QualityRepository, QualityService],
})
export class QualityModule {}
