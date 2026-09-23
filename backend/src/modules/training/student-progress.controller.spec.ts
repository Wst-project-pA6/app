import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { StudentProgressController } from './student-progress.controller';

describe('StudentProgressController', () => {
  const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never;
  const response = { studentId: 'student-1' };

  it('delegates every operation and exposes exact permissions', async () => {
    const service = {
      getCoverage: jest.fn().mockResolvedValue(response),
      getEligibility: jest.fn().mockResolvedValue(response),
    };
    const controller = new StudentProgressController(service as never);
    const studentId = '11111111-1111-4111-8111-111111111111';
    const query = { courseId: '22222222-2222-4222-8222-222222222222' };
    await expect(controller.getCoverage(studentId, query, actor)).resolves.toBe(response);
    await expect(controller.getEligibility(studentId, query, actor)).resolves.toBe(response);
    expect(service.getCoverage).toHaveBeenCalledWith(studentId, query.courseId, actor);
    expect(service.getEligibility).toHaveBeenCalledWith(studentId, query.courseId, actor);

    const reflector = new Reflector();
    const handler = (name: string): Function => Reflect.get(StudentProgressController.prototype, name) as Function;
    expect(reflector.get(PERMISSIONS_KEY, handler('getCoverage'))).toEqual(['training.read', 'students.self']);
    expect(reflector.get(PERMISSIONS_KEY, handler('getEligibility'))).toEqual(['training.read', 'students.self']);
  });
});
