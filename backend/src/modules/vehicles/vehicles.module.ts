import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { VehiclesController } from './vehicles.controller';
import { VehiclesRepository } from './vehicles.repository';
import { VehiclesService } from './vehicles.service';

@Module({
  imports: [AccessModule],
  controllers: [VehiclesController],
  providers: [VehiclesRepository, VehiclesService],
})
export class VehiclesModule {}
