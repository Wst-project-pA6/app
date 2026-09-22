import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { RequestContextModule } from './common/request-context/request-context.module';
import { DatabaseModule } from './common/database/database.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './modules/auth/auth.guard';
import { PermissionsGuard } from './common/auth/permissions.guard';
import { AccessModule } from './modules/access/access.module';
import { CustomersModule } from './modules/customers/customers.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { BaysModule } from './modules/bays/bays.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { QualityModule } from './modules/quality/quality.module';
import { LaborModule } from './modules/labor/labor.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { AuditEventsModule } from './modules/audit-events/audit-events.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PurchasingModule } from './modules/purchasing/purchasing.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { TrainingModule } from './modules/training/training.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),
    RequestContextModule,
    DatabaseModule,
    HealthModule,
    AuthModule,
    AccessModule,
    CustomersModule,
    VehiclesModule,
    BaysModule,
    JobsModule,
    ApprovalsModule,
    QualityModule,
    LaborModule,
    AttachmentsModule,
    AuditEventsModule,
    InventoryModule,
    PurchasingModule,
    InvoicesModule,
    TrainingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
