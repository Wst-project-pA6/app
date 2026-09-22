import 'reflect-metadata';
import { AppModule } from '../../app.module';
import { AccessModule } from '../access/access.module';
import { VehiclesModule } from './vehicles.module';

describe('VehiclesModule registration', () => {
  it('is imported by AppModule', () => {
    expect(Reflect.getMetadata('imports', AppModule)).toContain(VehiclesModule);
  });

  it('imports AccessModule for the existing scope service', () => {
    expect(Reflect.getMetadata('imports', VehiclesModule)).toContain(AccessModule);
  });
});
