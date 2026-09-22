import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { AuditEventsController } from './audit-events.controller';
import { AuditEventsService } from './audit-events.service';

@Module({
  imports: [AuditModule],
  controllers: [AuditEventsController],
  providers: [AuditEventsService],
})
export class AuditEventsModule {}
