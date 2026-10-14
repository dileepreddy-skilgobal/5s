import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateUserDto, UpdateUserDto, AssignRoleDto, UpdatePermissionDto } from './dto/user.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getUsersByTenant(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      include: {
        assignments: {
          include: {
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUserById(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      include: {
        assignments: {
          include: {
            role: true,
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException(`User with ID '${id}' not found`);
    }
    return user;
  }

  async createUser(tenantId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email: dto.email },
    });
    if (existing) {
      throw new ConflictException(`User with email '${dto.email}' already exists in this tenant`);
    }

    const defaultPasswordHash = await bcrypt.hash('User@123456', 10);
    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email,
        passwordHash: defaultPasswordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        jobTitle: dto.jobTitle,
        department: dto.department,
        phone: dto.phone,
        status: 'ACTIVE',
      },
    });

    // Assign role if specified
    if (dto.roleCode) {
      const role = await this.prisma.role.findFirst({
        where: { tenantId, code: dto.roleCode },
      });
      if (role) {
        await this.prisma.userRoleAssignment.create({
          data: {
            tenantId,
            userId: user.id,
            roleId: role.id,
          },
        });
      }
    }

    return this.getUserById(tenantId, user.id);
  }

  async updateUser(tenantId: string, id: string, dto: UpdateUserDto) {
    await this.getUserById(tenantId, id);
    return this.prisma.user.update({
      where: { id },
      data: dto,
    });
  }

  async deleteUser(tenantId: string, id: string) {
    await this.getUserById(tenantId, id);
    return this.prisma.user.delete({
      where: { id },
    });
  }

  // --- Roles & Permissions (RBAC Engine) ---

  async getRolesByTenant(tenantId: string) {
    return this.prisma.role.findMany({
      where: { tenantId },
      include: {
        permissions: true,
        _count: {
          select: { assignments: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getRoleById(tenantId: string, id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId },
      include: {
        permissions: true,
        assignments: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, jobTitle: true },
            },
          },
        },
      },
    });
    if (!role) {
      throw new NotFoundException(`Role with ID '${id}' not found`);
    }
    return role;
  }

  async updateRolePermissions(tenantId: string, roleId: string, permissions: UpdatePermissionDto[]) {
    await this.getRoleById(tenantId, roleId);

    // Atomic update of permissions
    await this.prisma.$transaction(async (tx) => {
      // Delete existing
      await tx.permission.deleteMany({
        where: { tenantId, roleId },
      });

      // Insert new
      for (const p of permissions) {
        await tx.permission.create({
          data: {
            tenantId,
            roleId,
            module: p.module,
            actions: JSON.stringify(p.actions),
            scope: p.scope || 'TENANT',
          },
        });
      }
    });

    return this.getRoleById(tenantId, roleId);
  }

  async assignRole(tenantId: string, userId: string, dto: AssignRoleDto) {
    await this.getUserById(tenantId, userId);

    const existing = await this.prisma.userRoleAssignment.findFirst({
      where: { tenantId, userId, roleId: dto.roleId },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.userRoleAssignment.create({
      data: {
        tenantId,
        userId,
        roleId: dto.roleId,
        orgNodeId: dto.orgNodeId,
      },
    });
  }
}
