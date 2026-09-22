import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { CustomersController } from './customers.controller';
import { CustomersRepository } from './customers.repository';
import { CustomersService } from './customers.service';

@Module({
  imports: [AccessModule, InvoicesModule],
  controllers: [CustomersController],
  providers: [CustomersRepository, CustomersService],
})
export class CustomersModule {}
