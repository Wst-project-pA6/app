import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';

/**
 * Liveness response matching the OpenAPI HealthStatus schema.
 */
export interface HealthStatus {
  status: 'UP';
  version: string;
  time: string; // RFC 3339 UTC timestamp
}

/**
 * Readiness component status matching the OpenAPI ReadinessStatus schema.
 */
export interface ReadinessComponent {
  name: 'DATABASE' | 'OBJECT_STORAGE' | 'AI_SERVICE';
  status: 'UP' | 'DOWN' | 'NOT_ENABLED';
  critical: boolean;
}

/**
 * Readiness response matching the OpenAPI ReadinessStatus schema.
 */
export interface ReadinessStatus {
  status: 'UP' | 'DEGRADED' | 'DOWN';
  components: ReadinessComponent[];
}

@Injectable()
export class HealthService {
  private readonly appVersion = process.env.npm_package_version ?? '0.0.1';
  private readonly startTime = new Date();

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Liveness probe - confirms the NestJS process is running.
   * Does NOT depend on any external dependencies.
   */
  getLiveness(): HealthStatus {
    return {
      status: 'UP',
      version: this.appVersion,
      time: new Date().toISOString(),
    };
  }

  /**
   * Readiness probe - checks critical dependencies.
   * Returns 200 with ReadinessStatus for UP/DEGRADED, throws AppError for DOWN (503).
   *
   * Per OpenAPI contract:
   * - DATABASE and OBJECT_STORAGE are critical dependencies
   * - AI_SERVICE is non-critical (optional)
   * - "An offline AI service yields DEGRADED with HTTP 200"
   * - "A critical failure returns 503"
   * - NOT_ENABLED means the service is not yet implemented/expected; it does not count as DOWN
   */
  async getReadiness(): Promise<ReadinessStatus> {
    const components: ReadinessComponent[] = [];

    // Check DATABASE (critical)
    const dbHealthy = await this.databaseService.checkConnection();
    components.push({
      name: 'DATABASE',
      status: dbHealthy ? 'UP' : 'DOWN',
      critical: true,
    });

    // Check OBJECT_STORAGE (critical) - not implemented yet, return NOT_ENABLED
    // Per roadmap: do not make readiness permanently fail because a future service is not implemented
    // When object storage is implemented, this will check the actual service
    components.push({
      name: 'OBJECT_STORAGE',
      status: 'NOT_ENABLED',
      critical: true,
    });

    // Check AI_SERVICE (non-critical) - not enabled yet
    components.push({
      name: 'AI_SERVICE',
      status: 'NOT_ENABLED',
      critical: false,
    });

    // Determine overall status per OpenAPI contract:
    // - Critical component DOWN → DOWN (503)
    // - Non-critical component DOWN (and no critical DOWN) → DEGRADED (200)
    // - NOT_ENABLED does not count as DOWN for either critical or non-critical
    // - Otherwise → UP (200)
    const criticalDown = components.some((c) => c.critical && c.status === 'DOWN');
    const nonCriticalDown = components.some((c) => !c.critical && c.status === 'DOWN');

    let overallStatus: 'UP' | 'DEGRADED' | 'DOWN';
    if (criticalDown) {
      overallStatus = 'DOWN';
    } else if (nonCriticalDown) {
      overallStatus = 'DEGRADED';
    } else {
      overallStatus = 'UP';
    }

    return {
      status: overallStatus,
      components,
    };
  }

  /**
   * Check if the service is ready (for internal use).
   * Returns true only if no critical component is DOWN.
   */
  async isReady(): Promise<boolean> {
    const readiness = await this.getReadiness();
    return readiness.status !== 'DOWN';
  }
}