import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(private readonly configService: ConfigService) {
    this.pool = new Pool({
      host: this.configService.get<string>('database.host'),
      port: this.configService.get<number>('database.port'),
      database: this.configService.get<string>('database.name'),
      user: this.configService.get<string>('database.user'),
      password: this.configService.get<string>('database.password'),
      max: this.configService.get<number>('database.maxConnections'),
      idleTimeoutMillis: this.configService.get<number>('database.idleTimeoutMs'),
      connectionTimeoutMillis: this.configService.get<number>('database.connectionTimeoutMs'),
      ssl: this.configService.get<boolean>('database.ssl'),
    });

    this.pool.on('error', (err) => {
      this.logger.error('Unexpected pool error', err);
    });
  }

  async onModuleInit(): Promise<void> {
    // Test the connection on startup
    await this.checkConnection();
    this.logger.log('Database pool initialized');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
    this.logger.log('Database pool closed');
  }

  /**
   * Execute a parameterized SELECT query.
   * @param text SQL query with $1, $2, ... placeholders
   * @param params Query parameters
   * @returns QueryResult with rows
   */
  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    const result = await this.pool.query<T>(text, params);
    const duration = Date.now() - start;
    this.logger.debug('Query executed', { durationMs: duration, rowCount: result.rowCount });
    return result;
  }

  /**
   * Execute a parameterized query returning a single row.
   * @param text SQL query with $1, $2, ... placeholders
   * @param params Query parameters
   * @returns Single row or null if not found
   */
  async queryOne<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<T | null> {
    const result = await this.query<T>(text, params);
    return result.rows[0] ?? null;
  }

  /**
   * Execute a parameterized query returning the first row's first column value.
   * @param text SQL query with $1, $2, ... placeholders
   * @param params Query parameters
   * @returns First column value of the first row, or null if not found
   */
  async queryValue<T = unknown>(
    text: string,
    params?: unknown[],
  ): Promise<T | null> {
    const row = await this.queryOne<Record<string, T>>(text, params);
    if (!row) return null;
    return Object.values(row)[0] as T;
  }

  /**
   * Execute a parameterized INSERT/UPDATE/DELETE query.
   * @param text SQL query with $1, $2, ... placeholders
   * @param params Query parameters
   * @returns QueryResult with rowCount
   */
  async execute(text: string, params?: unknown[]): Promise<QueryResult<QueryResultRow>> {
    const start = Date.now();
    const result = await this.pool.query(text, params);
    const duration = Date.now() - start;
    this.logger.debug('Execute executed', { durationMs: duration, rowCount: result.rowCount });
    return result;
  }

  /**
   * Lightweight connection check for health/readiness probes.
   * Executes SELECT 1 to verify pool connectivity.
   * @returns true if connection is healthy
   */
  async checkConnection(): Promise<boolean> {
    try {
      const result = await this.pool.query('SELECT 1');
      return result.rowCount === 1 && result.rows[0]?.['?column?'] === 1;
    } catch (error) {
      this.logger.error('Database connection check failed', error);
      return false;
    }
  }

  /**
   * Get a client from the pool for transactional operations.
   * The caller is responsible for releasing the client.
   * @returns PoolClient with BEGIN already executed
   */
  async getTransactionClient(): Promise<PoolClient> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      return client;
    } catch (error) {
      client.release(true);
      throw error;
    }
  }

  /**
   * Release a transaction client back to the pool.
   * Rolls back if the client still has an open transaction.
   * @param client PoolClient to release
   * @param rollback Whether to rollback instead of commit
   */
  async releaseTransactionClient(client: PoolClient, rollback = false): Promise<void> {
    try {
      if (rollback) {
        await client.query('ROLLBACK');
      } else {
        await client.query('COMMIT');
      }
    } catch (error) {
      this.logger.error('Transaction finalization failed', error);
      // Attempt rollback on any error
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback errors
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a callback within a database transaction.
   * Automatically handles BEGIN, COMMIT, ROLLBACK, and client release.
   * @param callback Function receiving a PoolClient; must return a Promise
   * @returns The callback's return value
   * @throws Any error thrown by the callback or transaction failure
   */
  async runInTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        this.logger.error('Transaction rollback failed', rollbackError);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get the underlying pg Pool instance for advanced use cases.
   * Prefer using query(), execute(), runInTransaction() instead.
   */
  getPool(): Pool {
    return this.pool;
  }
}