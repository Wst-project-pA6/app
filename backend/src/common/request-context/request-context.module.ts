import { Global, Module } from '@nestjs/common';
import { RequestContext } from './request-context';

/**
 * Global so every module resolves the same RequestContext singleton — the
 * AsyncLocalStorage instance populated by RequestContextMiddleware. A module that
 * declared its own RequestContext provider would get a disconnected instance whose
 * store is never populated.
 */
@Global()
@Module({
  providers: [RequestContext],
  exports: [RequestContext],
})
export class RequestContextModule {}
