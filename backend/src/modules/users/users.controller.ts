import { Controller, Get, Post, Patch, Delete, Param, Body, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, AssignRoleDto, UpdatePermissionDto } from './dto/user.dto';
import { Roles } from '../../core/guards/roles.decorator';

@ApiTags('Users & RBAC Management')
@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  private extractTenantId(tenantHeader?: string): string {
    return tenantHeader || 'default-tenant-skilglobal';
  }

  @Get()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S')
  @ApiOperation({ summary: 'List all users in tenant' })
  getUsers(@Headers('x-tenant-id') tenantId: string) {
    return this.usersService.getUsersByTenant(this.extractTenantId(tenantId));
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Create a new user within tenant' })
  createUser(@Headers('x-tenant-id') tenantId: string, @Body() dto: CreateUserDto) {
    return this.usersService.createUser(this.extractTenantId(tenantId), dto);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S')
  @ApiOperation({ summary: 'Get user details by ID' })
  getUserById(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.usersService.getUserById(this.extractTenantId(tenantId), id);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Update user profile' })
  updateUser(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.updateUser(this.extractTenantId(tenantId), id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Delete user' })
  deleteUser(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.usersService.deleteUser(this.extractTenantId(tenantId), id);
  }

  @Post(':id/roles')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Assign a role to user' })
  assignRole(@Headers('x-tenant-id') tenantId: string, @Param('id') userId: string, @Body() dto: AssignRoleDto) {
    return this.usersService.assignRole(this.extractTenantId(tenantId), userId, dto);
  }

  // --- Roles & RBAC Matrix Endpoints ---

  @Get('roles/all')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S')
  @ApiOperation({ summary: 'Get all roles and permissions for tenant' })
  getRoles(@Headers('x-tenant-id') tenantId: string) {
    return this.usersService.getRolesByTenant(this.extractTenantId(tenantId));
  }

  @Get('roles/:id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'PLANT_HEAD', 'COORDINATOR_5S')
  @ApiOperation({ summary: 'Get role details and permission matrix' })
  getRoleById(@Headers('x-tenant-id') tenantId: string, @Param('id') roleId: string) {
    return this.usersService.getRoleById(this.extractTenantId(tenantId), roleId);
  }

  @Patch('roles/:id/permissions')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN')
  @ApiOperation({ summary: 'Update permissions matrix for role' })
  updateRolePermissions(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') roleId: string,
    @Body() permissions: UpdatePermissionDto[],
  ) {
    return this.usersService.updateRolePermissions(this.extractTenantId(tenantId), roleId, permissions);
  }
}
