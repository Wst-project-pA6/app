import 'reflect-metadata';
import { AppModule } from '../../app.module';
import { AccessModule } from '../access/access.module';
import { JobsModule } from '../jobs/jobs.module';
import { AttachmentsModule } from './attachments.module';

describe('AttachmentsModule registration', () => {
  it('is imported by AppModule', () => {
    expect(Reflect.getMetadata('imports', AppModule)).toContain(AttachmentsModule);
  });

  it('imports AccessModule (ScopeService) and JobsModule (job-scope checks)', () => {
    const imports = Reflect.getMetadata('imports', AttachmentsModule);
    expect(imports).toContain(AccessModule);
    expect(imports).toContain(JobsModule);
  });
});
