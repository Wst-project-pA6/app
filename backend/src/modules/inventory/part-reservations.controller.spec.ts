import 'reflect-metadata';
import { BadRequestException, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { ErrorCode } from '../../common/errors/error-codes';
import {
  PartReservationCreateRequest,
  PartReservationListQuery,
  PartReservationStatus,
} from './dto/part-reservation.dto';
import { PartReservationsController } from './part-reservations.controller';
import { PartReservationsService } from './part-reservations.service';

describe('PartReservationsController', () => {
  const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never;
  const reservationResponse = {
    id: 'res-1',
    jobId: 'job-1',
    partId: 'part-1',
    storeId: 'store-1',
    quantity: 5,
    consumedQuantity: 0,
    status: PartReservationStatus.ACTIVE,
  };
  const listResponse = {
    items: [reservationResponse],
    page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
  };

  it('delegates operations to PartReservationsService and enforces exact permissions', async () => {
    const listMock = jest.fn().mockResolvedValue(listResponse);
    const reserveMock = jest.fn().mockResolvedValue(reservationResponse);
    const releaseMock = jest.fn().mockResolvedValue(reservationResponse);

    const service = {
      list: listMock,
      reserve: reserveMock,
      release: releaseMock,
    } as unknown as PartReservationsService;

    const controller = new PartReservationsController(service);

    const jobId = '11111111-1111-4111-8111-111111111111';
    const reservationId = '22222222-2222-4222-8222-222222222222';
    const query: PartReservationListQuery = { page: 1, pageSize: 20 };
    const createDto: PartReservationCreateRequest = {
      partId: '33333333-3333-4333-8333-333333333333',
      storeId: '44444444-4444-4444-8444-444444444444',
      quantity: 5,
    };

    await expect(controller.list(jobId, query, actor)).resolves.toBe(listResponse);
    await expect(controller.reserve(jobId, createDto, actor, 'valid-idempotency-key-123')).resolves.toBe(
      reservationResponse,
    );
    await expect(controller.release(jobId, reservationId, actor)).resolves.toBe(reservationResponse);

    expect(listMock.mock.calls).toEqual([[jobId, query, actor]]);
    expect(reserveMock.mock.calls).toEqual([[jobId, createDto, actor]]);
    expect(releaseMock.mock.calls).toEqual([[jobId, reservationId, actor]]);

    const reflector = new Reflector();
    const handler = (name: string): Function =>
      Reflect.get(PartReservationsController.prototype, name) as Function;

    expect(reflector.get(PERMISSIONS_KEY, handler('list'))).toEqual(['inventory.read', 'inventory.issue']);
    expect(reflector.get(PERMISSIONS_KEY, handler('reserve'))).toEqual(['inventory.issue']);
    expect(reflector.get(PERMISSIONS_KEY, handler('release'))).toEqual(['inventory.issue']);

    // Proves HTTP 200 metadata on release (not Nest's default POST 201)
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler('release'))).toBe(HttpStatus.OK);
  });

  it('validates jobId and reservationId UUID path parameters', async () => {
    const pipe = new ParseUUIDPipe();
    await expect(
      pipe.transform('invalid-uuid', { type: 'param', data: 'jobId', metatype: String }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform('invalid-uuid', { type: 'param', data: 'reservationId', metatype: String }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates Idempotency-Key length when provided', () => {
    const controller = new PartReservationsController({} as PartReservationsService);
    const createDto: PartReservationCreateRequest = {
      partId: '33333333-3333-4333-8333-333333333333',
      storeId: '44444444-4444-4444-8444-444444444444',
      quantity: 5,
    };

    expect(() =>
      controller.reserve('11111111-1111-4111-8111-111111111111', createDto, actor, 'short'),
    ).toThrow(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        code: ErrorCode.BAD_REQUEST,
      }),
    );

    expect(() =>
      controller.reserve('11111111-1111-4111-8111-111111111111', createDto, actor, 'a'.repeat(129)),
    ).toThrow(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        code: ErrorCode.BAD_REQUEST,
      }),
    );
  });
});
