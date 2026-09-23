import { Module } from '@nestjs/common';
import { SchedulingConflictService } from './scheduling-conflict.service';

@Module({
  providers: [SchedulingConflictService],
  exports: [SchedulingConflictService],
})
export class SchedulingConflictModule {}
