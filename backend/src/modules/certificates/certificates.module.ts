import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AuditModule } from '../../common/audit/audit.module';
import { TrainingModule } from '../training/training.module';
import { CertificatesController } from './certificates.controller';
import { CertificatesRepository } from './certificates.repository';
import { CertificatesService } from './certificates.service';
import {
  CERTIFICATE_VERIFICATION_RATE_LIMITER_CLOCK,
  CertificateVerificationRateLimiter,
} from './certificate-verification-rate-limiter';
import { PublicCertificateVerificationController } from './public-certificate-verification.controller';

@Module({
  imports: [AccessModule, AuditModule, TrainingModule],
  controllers: [CertificatesController, PublicCertificateVerificationController],
  providers: [
    CertificatesRepository,
    CertificatesService,
    CertificateVerificationRateLimiter,
    { provide: CERTIFICATE_VERIFICATION_RATE_LIMITER_CLOCK, useValue: Date.now },
  ],
})
export class CertificatesModule {}
