import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantReferenceService } from './tenant-reference.service';
import { TenantSettingsService } from '../config/tenant-settings.service';

@Global()
@Module({
  providers: [PrismaService, TenantReferenceService, TenantSettingsService],
  exports: [PrismaService, TenantReferenceService, TenantSettingsService],
})
export class DatabaseModule {}
