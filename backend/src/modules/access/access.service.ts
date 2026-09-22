import { HttpStatus, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { PasswordService } from '../auth/password.service';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import {
  AccessRepository,
  AccessUser,
  ScopeRow,
} from './access.repository';
import {
  CreateScopeDto,
  CreateUserDto,
  RoleAssignmentDto,
  ScopeAssignmentDto,
  ScopeListQuery,
  UpdateScopeDto,
  UpdateUserDto,
  UserListQuery,
} from './dto/access.dto';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const badRequest = (message = 'Bad request'): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

const conflict = (code: ErrorCode, message: string = code): AppError =>
  new AppError(HttpStatus.CONFLICT, code, message);

function mapUser(user: AccessUser) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    preferredLocale: user.preferred_locale,
    status: user.status,
    roles: user.roles,
    organizationScopeIds: user.organization_scope_ids,
    ...(user.student_id ? { studentId: user.student_id } : {}),
    mustChangePassword: user.must_change_password,
    ...(user.last_login_at ? { lastLoginAt: user.last_login_at } : {}),
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    createdBy: user.created_by,
    updatedBy: user.updated_by,
  };
}

function mapScope(scope: ScopeRow) {
  return {
    id: scope.id,
    code: scope.code,
    name: scope.name,
    type: scope.type,
    ...(scope.parent_id ? { parentId: scope.parent_id } : {}),
    status: scope.status,
    createdAt: scope.created_at,
    updatedAt: scope.updated_at,
    createdBy: scope.created_by,
    updatedBy: scope.updated_by,
  };
}

function rethrowUnlessDuplicate(error: unknown): never {
  if ((error as { code?: string })?.code === '23505') {
    throw conflict(ErrorCode.DUPLICATE_RESOURCE, 'Duplicate resource');
  }
  throw error;
}

@Injectable()
export class AccessService {
  constructor(
    private readonly repository: AccessRepository,
    private readonly database: DatabaseService,
    private readonly passwordService: PasswordService,
  ) {}

  async listUsers(query: UserListQuery) {
    if (query.sort && !/^-?(displayName|email|createdAt)$/.test(query.sort)) {
      throw badRequest('Unknown sort field');
    }
    const result = await this.repository.listUsers(query);
    return {
      items: result.rows.map(mapUser),
      page: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / query.pageSize),
      },
    };
  }

  async getUser(id: string) {
    const user = await this.repository.findUser(id);
    if (!user) throw notFound();
    return mapUser(user);
  }

  async createUser(dto: CreateUserDto, actor: AuthenticatedPrincipal) {
    const hash = await this.passwordService.hash(dto.temporaryPassword);
    try {
      const id = await this.database.runInTransaction((client) =>
        this.repository.createUser(client, {
          email: dto.email,
          displayName: dto.displayName,
          preferredLocale: dto.preferredLocale,
          hash,
          actor: actor.id,
        }),
      );
      return this.getUser(id);
    } catch (error) {
      return rethrowUnlessDuplicate(error);
    }
  }

  async updateUser(id: string, dto: UpdateUserDto, actor: AuthenticatedPrincipal) {
    if (Object.keys(dto).length === 0) throw badRequest('At least one property is required');
    const hash = dto.temporaryPassword
      ? await this.passwordService.hash(dto.temporaryPassword)
      : undefined;

    return this.database.runInTransaction(async (client) => {
      let administrators: { id: string }[] = [];
      if (dto.status === 'DISABLED') {
        administrators = await this.repository.lockActiveSystemAdmins(client);
      }
      const current = await this.repository.findUser(id, client, true);
      if (!current) throw notFound();
      if (dto.status === 'DISABLED' && id === actor.id) {
        throw conflict(
          ErrorCode.SEPARATION_OF_DUTIES_VIOLATION,
          'Separation of duties violation',
        );
      }
      if (
        dto.status === 'DISABLED' &&
        current.status === 'ACTIVE' &&
        current.roles.includes('SYSTEM_ADMIN') &&
        administrators.length <= 1
      ) {
        throw conflict(
          ErrorCode.SEPARATION_OF_DUTIES_VIOLATION,
          'The last active SYSTEM_ADMIN cannot be disabled',
        );
      }

      const values: Record<string, unknown> = { updated_by: actor.id };
      if (dto.displayName !== undefined) values.display_name = dto.displayName;
      if (dto.preferredLocale !== undefined) values.preferred_locale = dto.preferredLocale;
      if (dto.status !== undefined) values.status = dto.status;
      if (hash) {
        values.password_hash = hash;
        values.must_change_password = true;
      }
      await this.repository.updateUser(client, id, values);
      if (dto.status === 'DISABLED' || hash) await this.repository.revokeTokens(client, id);
      return mapUser((await this.repository.findUser(id, client))!);
    });
  }

  async replaceRoles(id: string, dto: RoleAssignmentDto, actor: AuthenticatedPrincipal) {
    if (id === actor.id) {
      throw conflict(
        ErrorCode.SEPARATION_OF_DUTIES_VIOLATION,
        'Separation of duties violation',
      );
    }
    if (new Set(dto.roles).size !== dto.roles.length || dto.roles.length > 10) {
      throw badRequest('Invalid roles');
    }

    return this.database.runInTransaction(async (client) => {
      const administrators = await this.repository.lockActiveSystemAdmins(client);
      const target = await this.repository.findUser(id, client, true);
      if (!target) throw notFound();
      if (
        target.roles.includes('SYSTEM_ADMIN') &&
        !dto.roles.includes('SYSTEM_ADMIN' as never) &&
        administrators.length <= 1
      ) {
        throw conflict(
          ErrorCode.SEPARATION_OF_DUTIES_VIOLATION,
          'The last active SYSTEM_ADMIN cannot be removed',
        );
      }
      await this.repository.replaceRoles(client, id, dto.roles, actor.id);
      return mapUser((await this.repository.findUser(id, client))!);
    });
  }

  async replaceScopes(
    id: string,
    dto: ScopeAssignmentDto,
    actor: AuthenticatedPrincipal,
  ) {
    if (
      new Set(dto.organizationScopeIds).size !== dto.organizationScopeIds.length ||
      dto.organizationScopeIds.length > 50
    ) {
      throw badRequest('Invalid organization scopes');
    }

    return this.database.runInTransaction(async (client) => {
      const target = await this.repository.findUser(id, client, true);
      if (!target) throw notFound();
      const scopes = await this.repository.lockActiveScopes(client, dto.organizationScopeIds);
      if (scopes.length !== dto.organizationScopeIds.length) throw notFound();
      await this.repository.replaceScopes(client, id, dto.organizationScopeIds, actor.id);
      return mapUser((await this.repository.findUser(id, client))!);
    });
  }

  async roles() {
    const result = await this.repository.roles();
    return { items: result.rows };
  }

  async listScopes(query: ScopeListQuery) {
    if (query.sort && !/^-?(name|code|createdAt)$/.test(query.sort)) {
      throw badRequest('Unknown sort field');
    }
    const result = await this.repository.listScopes(query);
    return {
      items: result.rows.map(mapScope),
      page: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / query.pageSize),
      },
    };
  }

  async createScope(dto: CreateScopeDto, actor: AuthenticatedPrincipal) {
    try {
      const scope = await this.database.runInTransaction(async (client) => {
        if (dto.parentId) {
          const parent = await client.query('SELECT id FROM organization_scopes WHERE id = $1', [dto.parentId]);
          if (!parent.rowCount) throw notFound();
        }
        return this.repository.createScope(client, {
          code: dto.code,
          name: dto.name,
          type: dto.type,
          parentId: dto.parentId,
          actor: actor.id,
        });
      });
      return mapScope(scope);
    } catch (error) {
      return rethrowUnlessDuplicate(error);
    }
  }

  async updateScope(id: string, dto: UpdateScopeDto, actor: AuthenticatedPrincipal) {
    if (Object.keys(dto).length === 0) throw badRequest('At least one property is required');
    const values: Record<string, unknown> = {};
    if (dto.name !== undefined) values.name = dto.name;
    if (dto.status !== undefined) values.status = dto.status;
    const scope = await this.repository.updateScope(id, values, actor.id);
    if (!scope) throw notFound();
    return mapScope(scope);
  }
}
