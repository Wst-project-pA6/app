import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: jest.Mocked<HealthService>;

  beforeEach(async () => {
    const mockHealthService = {
      getLiveness: jest.fn(),
      getReadiness: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: mockHealthService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthService = module.get(HealthService);
  });

  describe('getHealth', () => {
    it('should return liveness status from service', () => {
      const mockHealthStatus = {
        status: 'UP' as const,
        version: '1.0.0',
        time: '2026-01-15T10:30:00.000Z',
      };
      healthService.getLiveness.mockReturnValue(mockHealthStatus);

      const result = controller.getHealth();

      expect(result).toEqual(mockHealthStatus);
      const getLivenessMock = jest.mocked(healthService.getLiveness);
      expect(getLivenessMock).toHaveBeenCalledTimes(1);
    });

    it('should return correct structure matching OpenAPI HealthStatus schema', () => {
      const mockHealthStatus = {
        status: 'UP' as const,
        version: '1.0.0',
        time: '2026-01-15T10:30:00.000Z',
      };
      healthService.getLiveness.mockReturnValue(mockHealthStatus);

      const result = controller.getHealth();

      expect(result).toHaveProperty('status', 'UP');
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('time');
      expect(typeof result.version).toBe('string');
      expect(typeof result.time).toBe('string');
      // Verify timestamp format
      expect(new Date(result.time).toISOString()).toBe(result.time);
    });
  });

  describe('getReadiness', () => {
    it('should return readiness status UP when database is available (200 OK)', async () => {
      const mockReadinessStatus = {
        status: 'UP' as const,
        components: [
          { name: 'DATABASE' as const, status: 'UP' as const, critical: true },
          { name: 'OBJECT_STORAGE' as const, status: 'NOT_ENABLED' as const, critical: true },
          { name: 'AI_SERVICE' as const, status: 'NOT_ENABLED' as const, critical: false },
        ],
      };
      healthService.getReadiness.mockResolvedValue(mockReadinessStatus);

      const result = await controller.getReadiness();

      expect(result).toEqual(mockReadinessStatus);
      const getReadinessMock = jest.mocked(healthService.getReadiness);
      expect(getReadinessMock).toHaveBeenCalledTimes(1);
    });

    it('should return readiness status when UP (200 OK)', async () => {
      const mockReadinessStatus = {
        status: 'UP' as const,
        components: [
          { name: 'DATABASE' as const, status: 'UP' as const, critical: true },
          { name: 'OBJECT_STORAGE' as const, status: 'UP' as const, critical: true },
          { name: 'AI_SERVICE' as const, status: 'UP' as const, critical: false },
        ],
      };
      healthService.getReadiness.mockResolvedValue(mockReadinessStatus);

      const result = await controller.getReadiness();

      expect(result).toEqual(mockReadinessStatus);
      expect(result.status).toBe('UP');
    });

    it('should throw AppError with SERVICE_UNAVAILABLE when status is DOWN (database unavailable)', async () => {
      const mockReadinessStatus = {
        status: 'DOWN' as const,
        components: [
          { name: 'DATABASE' as const, status: 'DOWN' as const, critical: true },
          { name: 'OBJECT_STORAGE' as const, status: 'NOT_ENABLED' as const, critical: true },
          { name: 'AI_SERVICE' as const, status: 'NOT_ENABLED' as const, critical: false },
        ],
      };
      healthService.getReadiness.mockResolvedValue(mockReadinessStatus);

      await expect(controller.getReadiness()).rejects.toThrow(AppError);
      await expect(controller.getReadiness()).rejects.toMatchObject({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'A critical dependency is unavailable',
      });
    });

    it('should throw AppError with correct error code for GlobalExceptionFilter', async () => {
      const mockReadinessStatus = {
        status: 'DOWN' as const,
        components: [
          { name: 'DATABASE' as const, status: 'DOWN' as const, critical: true },
          { name: 'OBJECT_STORAGE' as const, status: 'NOT_ENABLED' as const, critical: true },
          { name: 'AI_SERVICE' as const, status: 'NOT_ENABLED' as const, critical: false },
        ],
      };
      healthService.getReadiness.mockResolvedValue(mockReadinessStatus);

      try {
        await controller.getReadiness();
        fail('Expected AppError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect(error.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        expect(error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
        expect(error.message).toBe('A critical dependency is unavailable');
      }
    });

    it('should return correct structure matching OpenAPI ReadinessStatus schema', async () => {
      const mockReadinessStatus = {
        status: 'UP' as const,
        components: [
          { name: 'DATABASE' as const, status: 'UP' as const, critical: true },
          { name: 'OBJECT_STORAGE' as const, status: 'NOT_ENABLED' as const, critical: true },
          { name: 'AI_SERVICE' as const, status: 'NOT_ENABLED' as const, critical: false },
        ],
      };
      healthService.getReadiness.mockResolvedValue(mockReadinessStatus);

      const result = await controller.getReadiness();

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('components');
      expect(['UP', 'DEGRADED', 'DOWN']).toContain(result.status);
      expect(Array.isArray(result.components)).toBe(true);
      expect(result.components).toHaveLength(3);

      result.components.forEach((component) => {
        expect(component).toHaveProperty('name');
        expect(component).toHaveProperty('status');
        expect(component).toHaveProperty('critical');
        expect(['DATABASE', 'OBJECT_STORAGE', 'AI_SERVICE']).toContain(component.name);
        expect(['UP', 'DOWN', 'NOT_ENABLED']).toContain(component.status);
        expect(typeof component.critical).toBe('boolean');
      });
    });
  });
});