import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AuditModule } from '../../common/audit/audit.module';
import { JobsModule } from '../jobs/jobs.module';
import { LaborController } from './labor.controller';
import { LaborRepository } from './labor.repository';
import { LaborService } from './labor.service';

@Module({
  imports: [AccessModule, AuditModule, JobsModule],
  controllers: [LaborController],
  providers: [LaborRepository, LaborService],
})
export class LaborModule {}
