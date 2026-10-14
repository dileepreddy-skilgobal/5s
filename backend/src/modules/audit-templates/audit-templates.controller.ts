import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuditTemplatesService } from './audit-templates.service';
import { CreateTemplateDto, CreateSectionDto, CreateQuestionDto, PublishVersionDto } from './dto/audit-template.dto';
import { Roles } from '../../core/guards/roles.decorator';

@ApiTags('Audit Template Builder Engine')
@Controller('api/v1/audit-templates')
export class AuditTemplatesController {
  constructor(private readonly templatesService: AuditTemplatesService) {}

  private extractTenantId(tenantHeader?: string): string {
    return tenantHeader || 'default-tenant-skilglobal';
  }

  @Get()
  @ApiOperation({ summary: 'List all audit templates with version count and category models' })
  getTemplates(
    @Headers('x-tenant-id') tenantId: string,
    @Query('auditType') auditType?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.templatesService.getTemplates(this.extractTenantId(tenantId), {
      auditType,
      status,
      search,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get template details with sections and questions across all 11 types' })
  getTemplateById(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.templatesService.getTemplateById(this.extractTenantId(tenantId), id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'COORDINATOR_5S')
  @ApiOperation({ summary: 'Create a new audit template with initial version 1.0' })
  createTemplate(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-user-id') userId: string,
    @Body() dto: CreateTemplateDto,
  ) {
    return this.templatesService.createTemplate(this.extractTenantId(tenantId), dto, userId);
  }

  @Post(':id/versions/:versionId/sections')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'COORDINATOR_5S')
  @ApiOperation({ summary: 'Add a 5S category section to template version' })
  addSection(
    @Headers('x-tenant-id') tenantId: string,
    @Param('versionId') versionId: string,
    @Body() dto: CreateSectionDto,
  ) {
    return this.templatesService.addSection(this.extractTenantId(tenantId), versionId, dto);
  }

  @Post('sections/:sectionId/questions')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'COORDINATOR_5S')
  @ApiOperation({ summary: 'Add question with type, weightage, severity, and critical safety caps' })
  addQuestion(
    @Headers('x-tenant-id') tenantId: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.templatesService.addQuestion(this.extractTenantId(tenantId), sectionId, dto);
  }

  @Post(':id/versions/:versionId/publish')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'COORDINATOR_5S')
  @ApiOperation({ summary: 'Publish and lock immutable template version snapshot' })
  publishVersion(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-user-id') userId: string,
    @Param('id') templateId: string,
    @Param('versionId') versionId: string,
    @Body() dto: PublishVersionDto,
  ) {
    return this.templatesService.publishVersion(this.extractTenantId(tenantId), templateId, versionId, dto, userId);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'COORDINATOR_5S')
  @ApiOperation({ summary: 'Update audit template metadata and scoring models' })
  updateTemplate(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() data: any,
  ) {
    return this.templatesService.updateTemplate(this.extractTenantId(tenantId), id, data);
  }

  @Post(':id/clone')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'COORDINATOR_5S')
  @ApiOperation({ summary: 'Clone template into a new editable template' })
  cloneTemplate(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() body: { code: string; name?: string },
  ) {
    return this.templatesService.cloneTemplate(this.extractTenantId(tenantId), id, body.code, body.name, userId);
  }

  @Patch('sections/:sectionId')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'COORDINATOR_5S')
  @ApiOperation({ summary: 'Update template section metadata or sort order' })
  updateSection(
    @Headers('x-tenant-id') tenantId: string,
    @Param('sectionId') sectionId: string,
    @Body() data: any,
  ) {
    return this.templatesService.updateSection(this.extractTenantId(tenantId), sectionId, data);
  }

  @Patch('questions/:questionId')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'COORDINATOR_5S')
  @ApiOperation({ summary: 'Update template question config' })
  updateQuestion(
    @Headers('x-tenant-id') tenantId: string,
    @Param('questionId') questionId: string,
    @Body() dto: any,
  ) {
    return this.templatesService.updateQuestion(this.extractTenantId(tenantId), questionId, dto);
  }

  @Delete('questions/:questionId')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'COORDINATOR_5S')
  @ApiOperation({ summary: 'Delete question' })
  deleteQuestion(@Headers('x-tenant-id') tenantId: string, @Param('questionId') questionId: string) {
    return this.templatesService.deleteQuestion(this.extractTenantId(tenantId), questionId);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ORG_ADMIN', 'COORDINATOR_5S')
  @ApiOperation({ summary: 'Delete template' })
  deleteTemplate(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.templatesService.deleteTemplate(this.extractTenantId(tenantId), id);
  }
}
