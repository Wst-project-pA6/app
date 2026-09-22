import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { BaysController } from './bays.controller';
import { BaysRepository } from './bays.repository';
import { BaysService } from './bays.service';

@Module({
  imports: [AccessModule],
  controllers: [BaysController],
  providers: [BaysRepository, BaysService],
  exports: [BaysRepository],
})
export class BaysModule {}
