import 'reflect-metadata';
import { AppModule } from '../../app.module';
import { AccessModule } from '../access/access.module';
import { AuditModule } from '../../common/audit/audit.module';
import { DatabaseModule } from '../../common/database/database.module';
import { InvoicesController } from './invoices.controller';
import { JobInvoicesController } from './job-invoices.controller';
import { InvoicesModule } from './invoices.module';
import { InvoicesRepository } from './invoices.repository';
import { InvoicesService } from './invoices.service';

describe('InvoicesModule registration', () => {
  it('is imported by AppModule', () => {
    expect(Reflect.getMetadata('imports', AppModule)).toContain(InvoicesModule);
  });

  it('declares controllers and providers for invoicing and payments', () => {
    const controllers = Reflect.getMetadata('controllers', InvoicesModule);
    expect(controllers).toContain(InvoicesController);
    expect(controllers).toContain(JobInvoicesController);

    const providers = Reflect.getMetadata('providers', InvoicesModule);
    expect(providers).toContain(InvoicesService);
    expect(providers).toContain(InvoicesRepository);

    const exports = Reflect.getMetadata('exports', InvoicesModule);
    expect(exports).toContain(InvoicesService);
    expect(exports).toContain(InvoicesRepository);
  });

  it('imports core infrastructure modules', () => {
    const imports = Reflect.getMetadata('imports', InvoicesModule);
    expect(imports).toContain(AccessModule);
    expect(imports).toContain(AuditModule);
    expect(imports).toContain(DatabaseModule);
  });
});
