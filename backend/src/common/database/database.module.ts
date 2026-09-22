import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { TransactionService } from './transaction.service';

/**
 * DatabaseModule provides the DatabaseService and TransactionService as global providers.
 * The DatabaseService manages a pg.Pool connection to PostgreSQL and provides
 * typed query helpers, connection health checks, and transaction support.
 */
@Global()
@Module({
  providers: [DatabaseService, TransactionService],
  exports: [DatabaseService, TransactionService],
})
export class DatabaseModule {}