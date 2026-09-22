import 'reflect-metadata';
import { AppModule } from '../../app.module';
import { AccessModule } from '../access/access.module';
import { CustomersModule } from './customers.module';

describe('CustomersModule registration', () => {
  it('is imported by AppModule', () => {
    expect(Reflect.getMetadata('imports', AppModule)).toContain(CustomersModule);
  });

  it('imports AccessModule for the existing scope service', () => {
    expect(Reflect.getMetadata('imports', CustomersModule)).toContain(AccessModule);
  });
});
