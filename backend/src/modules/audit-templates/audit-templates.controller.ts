import { Controller, Get, Post, Patch, Delete, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { RoleGroups } from '../../core/guards/role-groups';
import { TenantId, CurrentUserId } from '../../core/auth/current-user.decorator';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuditTemplatesService } from './audit-templates.service';
import {
  CreateTemplateDto,
  CreateSectionDto,
  CreateQuestionDto,
  PublishVersionDto,
  UpdateTemplateDto,
  CloneTemplateDto,
  UpdateSectionDto,
  UpdateQuestionDto,
  ReorderQuestionsDto,
} from './dto/audit-template.dto';
import { Roles } from '../../core/guards/roles.decorator';

@ApiTags('Audit templates')
@ApiBearerAuth()
@Controller('api/v1/audit-templates')
export class AuditTemplatesController {
  constructor(private readonly templatesService: AuditTemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'List all audit templates with version count and category models' })
  getTemplates(
    @TenantId() tenantId: string,
    @Query('auditType') auditType?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.templatesService.getTemplates(tenantId, {
      auditType,
      status,
      search,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get template details with sections and questions across all 11 types' })
  getTemplateById(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.templatesService.getTemplateById(tenantId, id);
  }

  @Post()
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Create a new audit template with an editable draft version 1.0' })
  createTemplate(
    @TenantId() tenantId: string,
    @CurrentUserId() userId: string,
    @Body() dto: CreateTemplateDto,
  ) {
    return this.templatesService.createTemplate(tenantId, dto, userId);
  }

  @Post(':id/versions')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Create a new draft version copied from the latest version (409 while a draft exists)' })
  createVersion(@TenantId() tenantId: string, @Param('id') templateId: string) {
    return this.templatesService.createVersion(tenantId, templateId);
  }

  @Post(':id/versions/:versionId/sections')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Add a 5S category section to template version' })
  addSection(
    @TenantId() tenantId: string,
    @Param('id') templateId: string,
    @Param('versionId') versionId: string,
    @Body() dto: CreateSectionDto,
  ) {
    return this.templatesService.addSection(tenantId, templateId, versionId, dto);
  }

  @Post('sections/:sectionId/questions')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Add question with type, weightage, severity, and critical safety caps' })
  addQuestion(
    @TenantId() tenantId: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.templatesService.addQuestion(tenantId, sectionId, dto);
  }

  @Post('sections/:sectionId/questions/reorder')
  @HttpCode(HttpStatus.OK)
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Reorder the questions of a draft section (send every question id in the new order)' })
  reorderQuestions(
    @TenantId() tenantId: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: ReorderQuestionsDto,
  ) {
    return this.templatesService.reorderQuestions(tenantId, sectionId, dto.questionIds);
  }

  @Post(':id/versions/:versionId/publish')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Publish a draft version; published versions can no longer be edited' })
  publishVersion(
    @TenantId() tenantId: string,
    @CurrentUserId() userId: string,
    @Param('id') templateId: string,
    @Param('versionId') versionId: string,
    @Body() dto: PublishVersionDto,
  ) {
    return this.templatesService.publishVersion(tenantId, templateId, versionId, dto, userId);
  }

  @Patch(':id')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Update audit template metadata and scoring models' })
  updateTemplate(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() data: UpdateTemplateDto,
  ) {
    return this.templatesService.updateTemplate(tenantId, id, data);
  }

  @Post(':id/clone')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Clone template into a new editable template' })
  cloneTemplate(
    @TenantId() tenantId: string,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: CloneTemplateDto,
  ) {
    return this.templatesService.cloneTemplate(tenantId, id, body.code, body.name, userId);
  }

  @Patch('sections/:sectionId')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Update template section metadata or sort order' })
  updateSection(
    @TenantId() tenantId: string,
    @Param('sectionId') sectionId: string,
    @Body() data: UpdateSectionDto,
  ) {
    return this.templatesService.updateSection(tenantId, sectionId, data);
  }

  @Delete('sections/:sectionId')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Delete a section and its questions from a draft version' })
  deleteSection(@TenantId() tenantId: string, @Param('sectionId') sectionId: string) {
    return this.templatesService.deleteSection(tenantId, sectionId);
  }

  @Patch('questions/:questionId')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Update template question config' })
  updateQuestion(
    @TenantId() tenantId: string,
    @Param('questionId') questionId: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.templatesService.updateQuestion(tenantId, questionId, dto);
  }

  @Delete('questions/:questionId')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Delete question' })
  deleteQuestion(@TenantId() tenantId: string, @Param('questionId') questionId: string) {
    return this.templatesService.deleteQuestion(tenantId, questionId);
  }

  @Delete(':id')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Delete template' })
  deleteTemplate(@TenantId() tenantId: string, @CurrentUserId() actorId: string, @Param('id') id: string) {
    return this.templatesService.deleteTemplate(tenantId, id, actorId);
  }
}
