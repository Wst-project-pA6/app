import { Module } from '@nestjs/common';
import { AccessController } from './access.controller';
import { AccessService } from './access.service';
import { AccessRepository } from './access.repository';
import { AuthModule } from '../auth/auth.module';
import { ScopeService } from '../../common/auth/scope.service';
@Module({imports:[AuthModule],controllers:[AccessController],providers:[AccessService,AccessRepository,ScopeService],exports:[ScopeService]})
export class AccessModule {}
