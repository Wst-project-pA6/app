import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { StudentRow, StudentsRepository } from './students.repository';
import { StudentsService } from './students.service';

const studentId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const staffActor: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'supervisor@example.test', displayName: 'Supervisor',
  preferredLocale: 'en', roles: ['TRAINING_SUPERVISOR'], permissions: ['training.read', 'training.manage'],
  organizationScopeIds: [], mustChangePassword: false,
};
const ownStudentActor: AuthenticatedPrincipal = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'student@example.test', displayName: 'Student',
  preferredLocale: 'en', roles: ['STUDENT'], permissions: ['students.self'],
  organizationScopeIds: [], studentId, mustChangePassword: false,
};
const otherStudentActor: AuthenticatedPrincipal = {
  ...ownStudentActor, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', studentId: '99999999-9999-4999-8999-999999999999',
};
const mentorActor: AuthenticatedPrincipal = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', email: 'mentor@example.test', displayName: 'Mentor',
  preferredLocale: 'en', roles: ['MENTOR'], permissions: ['training.read'],
  organizationScopeIds: [], mustChangePassword: false,
};
const row: StudentRow = {
  id: studentId, user_id: userId, student_number: 'STU-001', status: 'ACTIVE',
  created_at: new Date(), updated_at: new Date(), created_by: staffActor.id, updated_by: staffActor.id,
  display_name: 'Student One',
};

const transaction = (client: unknown = {}) => ({
  runInTransaction: jest.fn(async (work: (value: never) => unknown) => work(client as never)),
}) as unknown as TransactionService;

describe('StudentsService', () => {
  it('a student may read only their own profile; any other studentId conceals as 404', async () => {
    const findById = jest.fn().mockResolvedValue(row);
    const repository = { findById } as unknown as StudentsRepository;
    const service = new StudentsService(repository, transaction());

    await expect(service.get(studentId, ownStudentActor)).resolves.toMatchObject({ id: studentId });
    await expect(service.get(studentId, otherStudentActor)).rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
    expect(findById).toHaveBeenCalledTimes(1);
  });

  it('staff holding training.read can read any student', async () => {
    const repository = { findById: jest.fn().mockResolvedValue(row) } as unknown as StudentsRepository;
    const service = new StudentsService(repository, transaction());
    await expect(service.get(studentId, staffActor)).resolves.toMatchObject({ id: studentId, displayName: 'Student One' });
  });

  it('restricts a mentor listing to students of their own sessions', async () => {
    const list = jest.fn().mockResolvedValue({ rows: [row], totalItems: 1 });
    const repository = { list } as unknown as StudentsRepository;
    const service = new StudentsService(repository, transaction());
    await service.list({ page: 1, pageSize: 20 }, mentorActor);
    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, { mentorUserId: mentorActor.id });

    await service.list({ page: 1, pageSize: 20 }, staffActor);
    expect(list).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 }, {});
  });

  it('creates a student profile only for an eligible STUDENT-role user', async () => {
    const create = jest.fn().mockResolvedValue(row);
    const repository = {
      findEligibleUser: jest.fn().mockResolvedValue({ id: userId }),
      create,
    } as unknown as StudentsRepository;
    const service = new StudentsService(repository, transaction());
    await expect(service.create({ userId, studentNumber: 'STU-001' }, staffActor)).resolves.toMatchObject({ id: studentId });

    const ineligible = { findEligibleUser: jest.fn().mockResolvedValue(null) } as unknown as StudentsRepository;
    await expect(new StudentsService(ineligible, transaction()).create({ userId, studentNumber: 'STU-001' }, staffActor))
      .rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED, statusCode: 422 });
  });

  it('maps a duplicate user/studentNumber and preserves unexpected database errors', async () => {
    const duplicate = { code: '23505' };
    const dupRepository = {
      findEligibleUser: jest.fn().mockResolvedValue({ id: userId }),
      create: jest.fn().mockRejectedValue(duplicate),
    } as unknown as StudentsRepository;
    await expect(new StudentsService(dupRepository, transaction()).create({ userId, studentNumber: 'STU-001' }, staffActor))
      .rejects.toMatchObject({ code: ErrorCode.DUPLICATE_RESOURCE, statusCode: 409 });

    const unexpected = new Error('database unavailable');
    const failRepository = {
      findEligibleUser: jest.fn().mockResolvedValue({ id: userId }),
      create: jest.fn().mockRejectedValue(unexpected),
    } as unknown as StudentsRepository;
    await expect(new StudentsService(failRepository, transaction()).create({ userId, studentNumber: 'STU-001' }, staffActor))
      .rejects.toBe(unexpected);
  });

  it('rejects an unallowlisted sort', async () => {
    const repository = { list: jest.fn() } as unknown as StudentsRepository;
    const service = new StudentsService(repository, transaction());
    await expect(service.list({ page: 1, pageSize: 20, sort: 'status' }, staffActor))
      .rejects.toMatchObject({ statusCode: 400, code: ErrorCode.BAD_REQUEST });
  });
});
