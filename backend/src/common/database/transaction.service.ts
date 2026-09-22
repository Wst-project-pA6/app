import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from './database.service';

/**
 * TransactionService provides a simplified API for running code within a database transaction.
 * It wraps DatabaseService.runInTransaction with a more explicit interface.
 */
@Injectable()
export class TransactionService {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Execute a function within a database transaction.
   * @param work Function that receives a transaction client and returns a Promise
   * @returns The resolved value of the work function
   * @throws Any error thrown by the work function (transaction is rolled back)
   */
  async runInTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.databaseService.runInTransaction(work);
  }

}
