import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AuditModule } from '../../common/audit/audit.module';
import { ATTACHMENT_STORAGE } from '../../common/storage/attachment-storage';
import { LocalAttachmentStorage } from '../../common/storage/local-attachment-storage';
import { JobsModule } from '../jobs/jobs.module';
import { ATTACHMENT_RATE_LIMITER_CLOCK, AttachmentRateLimiter } from './attachment-rate-limiter';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsRepository } from './attachments.repository';
import { ATTACHMENTS_CLOCK, AttachmentsService } from './attachments.service';
import { JobAttachmentsController } from './job-attachments.controller';

@Module({
  imports: [AccessModule, AuditModule, JobsModule],
  controllers: [AttachmentsController, JobAttachmentsController],
  providers: [
    AttachmentsRepository,
    AttachmentsService,
    AttachmentRateLimiter,
    { provide: ATTACHMENT_RATE_LIMITER_CLOCK, useValue: Date.now },
    { provide: ATTACHMENTS_CLOCK, useValue: Date.now },
    { provide: ATTACHMENT_STORAGE, useClass: LocalAttachmentStorage },
  ],
})
export class AttachmentsModule {}
