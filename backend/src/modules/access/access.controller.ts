import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { AccessService } from './access.service';
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

@Controller()
export class AccessController {
  constructor(private readonly service: AccessService) {}

  @Get('users')
  @Permissions('users.read')
  listUsers(@Query() query: UserListQuery) {
    return this.service.listUsers(query);
  }

  @Post('users')
  @Permissions('users.manage')
  createUser(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.createUser(dto, actor);
  }

  @Get('users/:userId')
  @Permissions('users.read')
  getUser(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.service.getUser(userId);
  }

  @Patch('users/:userId')
  @Permissions('users.manage')
  updateUser(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.updateUser(userId, dto, actor);
  }

  @Put('users/:userId/roles')
  @Permissions('roles.assign')
  replaceRoles(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: RoleAssignmentDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.replaceRoles(userId, dto, actor);
  }

  @Put('users/:userId/organization-scopes')
  @Permissions('scopes.manage')
  replaceScopes(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: ScopeAssignmentDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.replaceScopes(userId, dto, actor);
  }

  @Get('roles')
  @Permissions('users.read')
  roles() {
    return this.service.roles();
  }

  @Get('organization-scopes')
  @Permissions('scopes.manage', 'users.read')
  listScopes(@Query() query: ScopeListQuery) {
    return this.service.listScopes(query);
  }

  @Post('organization-scopes')
  @Permissions('scopes.manage')
  createScope(@Body() dto: CreateScopeDto, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.createScope(dto, actor);
  }

  @Patch('organization-scopes/:scopeId')
  @Permissions('scopes.manage')
  updateScope(
    @Param('scopeId', new ParseUUIDPipe()) scopeId: string,
    @Body() dto: UpdateScopeDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.updateScope(scopeId, dto, actor);
  }
}
