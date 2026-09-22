import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService } from './health.service';
import type { HealthStatus, ReadinessStatus } from './health.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Public } from '../../common/auth/public.decorator';

/**
 * Health controller providing liveness and readiness endpoints.
 * These endpoints are public (no authentication required) as per the OpenAPI contract.
 */
@ApiTags('System Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * GET /health
   * Liveness probe - confirms the process is running.
   * No dependency checks. Returns 200 with HealthStatus.
   */
  @Get()
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getHealth',
    summary: 'Liveness probe',
    description: 'Public. Returns 200 while the process runs; no dependency checks. Used by container restart policy.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Alive',
    schema: {
      type: 'object',
      required: ['status', 'time'],
      properties: {
        status: { type: 'string', enum: ['UP'] },
        version: { type: 'string' },
        time: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Internal server error',
  })
  getHealth(): HealthStatus {
    return this.healthService.getLiveness();
  }

  /**
   * GET /health/ready
   * Readiness probe - checks database and other critical dependencies.
   * Returns 200 with ReadinessStatus for UP/DEGRADED.
   * Returns 503 with Error schema for DOWN (critical dependency failure).
   */
  @Get('ready')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'getReadiness',
    summary: 'Readiness probe',
    description:
      'Public. Checks the database and object storage (critical) and the optional AI service (non-critical). ' +
      'An offline AI service yields DEGRADED with HTTP 200 and never blocks workshop or training operations. ' +
      'A critical failure returns 503.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Ready or degraded',
    schema: {
      type: 'object',
      required: ['status', 'components'],
      properties: {
        status: { type: 'string', enum: ['UP', 'DEGRADED', 'DOWN'] },
        components: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'status', 'critical'],
            properties: {
              name: { type: 'string', enum: ['DATABASE', 'OBJECT_STORAGE', 'AI_SERVICE'] },
              status: { type: 'string', enum: ['UP', 'DOWN', 'NOT_ENABLED'] },
              critical: { type: 'boolean' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'A critical dependency (database or object storage) is unavailable.',
    schema: {
      type: 'object',
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string', enum: ['SERVICE_UNAVAILABLE'] },
        message: { type: 'string' },
        details: { type: 'array', items: { type: 'object' } },
        requestId: { type: 'string' },
      },
    },
  })
  async getReadiness(): Promise<ReadinessStatus> {
    const readiness = await this.healthService.getReadiness();

    // If critical dependency is down, throw AppError to trigger 503 via GlobalExceptionFilter
    if (readiness.status === 'DOWN') {
      throw new AppError(
        HttpStatus.SERVICE_UNAVAILABLE,
        ErrorCode.SERVICE_UNAVAILABLE,
        'A critical dependency is unavailable',
      );
    }

    return readiness;
  }
}
