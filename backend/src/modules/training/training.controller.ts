import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { Roles } from '../../core/guards/roles.decorator';
import { RoleGroups } from '../../core/guards/role-groups';
import { TenantId, CurrentUserId } from '../../core/auth/current-user.decorator';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { TrainingService } from './training.service';
import { SubmitQuizDto, UpdateLessonProgressDto } from './dto/training.dto';

@ApiTags('Training & Onboarding Academy')
@ApiBearerAuth()
@Controller('api/v1/training')
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  @Get('courses')
  @ApiOperation({ summary: 'Get all training courses with their lessons' })
  async getCourses() {
    return this.trainingService.getCourses();
  }

  @Get('courses/:id')
  @ApiOperation({ summary: 'Get one training course with its lessons and key takeaways' })
  async getCourseById(@Param('id') id: string) {
    return this.trainingService.getCourseById(id);
  }

  @Get('quiz')
  @ApiOperation({ summary: 'Get the 5S competency quiz (options are shuffled on every call)' })
  async getQuizQuestions() {
    return this.trainingService.getQuizQuestions();
  }

  @Get('progress')
  @ApiOperation({ summary: "The signed-in user's lesson progress for every course" })
  async getProgress(@TenantId() tenantId: string, @CurrentUserId() userId: string) {
    return this.trainingService.getProgress(tenantId, userId);
  }

  @Post('progress')
  @ApiOperation({ summary: 'Mark a lesson done or not done; the course completes when all its lessons are done' })
  async updateProgress(
    @TenantId() tenantId: string,
    @CurrentUserId() userId: string,
    @Body() dto: UpdateLessonProgressDto,
  ) {
    return this.trainingService.updateProgress(tenantId, userId, dto);
  }

  @Post('quiz/submit')
  @ApiOperation({ summary: 'Submit quiz answers (question id -> chosen option text); a pass issues or renews the certificate' })
  async submitQuiz(
    @TenantId() tenantId: string,
    @CurrentUserId() userId: string,
    @Body() dto: SubmitQuizDto,
  ) {
    return this.trainingService.submitQuiz(dto, tenantId, userId);
  }

  @Get('certificate/:id')
  @ApiOperation({ summary: 'Verify and retrieve issued 5S Practitioner Certificate' })
  async getCertificate(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.trainingService.getCertificate(tenantId, id);
  }

  @Get('certificates/me')
  @ApiOperation({ summary: 'My training certificates (valid, expired and revoked)' })
  async myCertificates(@TenantId() tenantId: string, @CurrentUserId() userId: string) {
    return this.trainingService.listCertificates(tenantId, userId);
  }

  @Get('certificates')
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Auditor competency register: all certificates in the organization (optionally ?userId=)' })
  async allCertificates(@TenantId() tenantId: string, @Query('userId') userId?: string) {
    return this.trainingService.listCertificates(tenantId, userId);
  }

  @Post('certificates/:id/revoke')
  @Roles(...RoleGroups.ORG_ADMINS)
  @ApiOperation({ summary: 'Revoke a training certificate (removes audit eligibility when certification is required)' })
  async revokeCertificate(@TenantId() tenantId: string, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.trainingService.revokeCertificate(tenantId, id, userId);
  }
}
