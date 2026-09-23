import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { AttendanceController } from './attendance.controller';

describe('AttendanceController', () => {
  const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never;
  const response = { items: [] };

  it('delegates every operation and exposes exact permissions', async () => {
    const service = {
      record: jest.fn().mockResolvedValue(response),
      list: jest.fn().mockResolvedValue(response),
    };
    const controller = new AttendanceController(service as never);
    const sessionId = '11111111-1111-4111-8111-111111111111';
    const dto = { records: [{ studentId: '22222222-2222-4222-8222-222222222222', status: 'PRESENT' }] } as never;
    const query = { page: 1, pageSize: 20 };
    await expect(controller.record(sessionId, dto, actor)).resolves.toBe(response);
    await expect(controller.list(query, actor)).resolves.toBe(response);
    expect(service.record).toHaveBeenCalledWith(sessionId, dto, actor);
    expect(service.list).toHaveBeenCalledWith(query, actor);

    const reflector = new Reflector();
    const handler = (name: string): Function => Reflect.get(AttendanceController.prototype, name) as Function;
    expect(reflector.get(PERMISSIONS_KEY, handler('record'))).toEqual(['training.attendance.record']);
    expect(reflector.get(PERMISSIONS_KEY, handler('list'))).toEqual(['training.read', 'students.self']);
  });
});
