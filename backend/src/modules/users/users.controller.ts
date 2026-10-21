import { Controller, Get, Post, Patch, Delete, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { RoleGroups } from '../../core/guards/role-groups';
import { TenantId, CurrentUser } from '../../core/auth/current-user.decorator';
import { AuthenticatedUser } from '../../core/auth/auth.types';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { SessionService } from '../../core/auth/session.service';
import { MfaService } from '../auth/mfa.service';
import { CreateUserDto, UpdateUserDto, AssignRoleDto, ResetPinDto, UserListQueryDto } from './dto/user.dto';
import { Roles } from '../../core/guards/roles.decorator';

@ApiTags('Users & RBAC Management')
@ApiBearerAuth()
@Controller('api/v1/users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly sessions: SessionService,
    private readonly mfa: MfaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List users in tenant (optional search, role and status filters)' })
  getUsers(@TenantId() tenantId: string, @Query() query: UserListQueryDto) {
    return this.usersService.getUsersByTenant(tenantId, query);
  }

  @Post()
  @Roles(...RoleGroups.ORG_ADMINS)
  @ApiOperation({ summary: 'Create a new user within tenant' })
  createUser(@TenantId() tenantId: string, @Body() dto: CreateUserDto) {
    return this.usersService.createUser(tenantId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user details by ID' })
  getUserById(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.usersService.getUserById(tenantId, id);
  }

  @Patch(':id')
  @Roles(...RoleGroups.ORG_ADMINS)
  @ApiOperation({ summary: 'Update user profile' })
  updateUser(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateUser(tenantId, id, dto, actor);
  }

  @Delete(':id')
  @Roles(...RoleGroups.ORG_ADMINS)
  @ApiOperation({ summary: 'Delete user' })
  deleteUser(@TenantId() tenantId: string, @CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.deleteUser(tenantId, id, actor);
  }

  @Post(':id/revoke-sessions')
  @Roles(...RoleGroups.ORG_ADMINS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign a user out of every device (e.g. lost phone, leaver)' })
  async revokeSessions(@TenantId() tenantId: string, @Param('id') userId: string) {
    await this.usersService.getUserById(tenantId, userId);
    return { sessionsRevoked: await this.sessions.revokeAll(userId, 'REVOKED_BY_ADMIN') };
  }

  @Post(':id/reset-pin')
  @Roles(...RoleGroups.ORG_ADMINS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Set a new operator PIN for a user's badge sign-in (clears any lockout)" })
  resetPin(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') userId: string,
    @Body() dto: ResetPinDto,
  ) {
    return this.usersService.resetPin(tenantId, userId, dto.pin, actor);
  }

  @Post(':id/reset-mfa')
  @Roles(...RoleGroups.ORG_ADMINS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Remove a user's two-factor enrolment (lost device); signs them out everywhere" })
  resetMfa(@TenantId() tenantId: string, @Param('id') userId: string) {
    return this.mfa.adminReset(tenantId, userId);
  }

  @Post(':id/roles')
  @Roles(...RoleGroups.ORG_ADMINS)
  @ApiOperation({ summary: 'Assign a role to user' })
  assignRole(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') userId: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.usersService.assignRole(tenantId, userId, dto, actor);
  }

  @Delete(':id/roles/:assignmentId')
  @Roles(...RoleGroups.ORG_ADMINS)
  @ApiOperation({ summary: 'Remove a role assignment from a user' })
  removeRole(
    @TenantId() tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') userId: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.usersService.removeRole(tenantId, userId, assignmentId, actor);
  }

  // --- Roles & RBAC Matrix Endpoints ---

  @Get('roles/access-matrix')
  @Roles(...RoleGroups.ROLE_VIEWERS)
  @ApiOperation({ summary: 'What each role may do, generated from the rules the API enforces (read-only)' })
  getAccessMatrix(@TenantId() tenantId: string) {
    return this.usersService.getAccessMatrix(tenantId);
  }

  @Get('roles/all')
  @Roles(...RoleGroups.ROLE_VIEWERS)
  @ApiOperation({ summary: 'Get all roles and permissions for tenant' })
  getRoles(@TenantId() tenantId: string) {
    return this.usersService.getRolesByTenant(tenantId);
  }

  @Get('roles/:id')
  @Roles(...RoleGroups.ROLE_VIEWERS)
  @ApiOperation({ summary: 'Get role details and permission matrix' })
  getRoleById(@TenantId() tenantId: string, @Param('id') roleId: string) {
    return this.usersService.getRoleById(tenantId, roleId);
  }

}
