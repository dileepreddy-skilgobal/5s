import { Controller, Get, Post, Body, Param, Headers, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TrainingService } from './training.service';
import { SubmitQuizDto } from './dto/training.dto';

@ApiTags('Training & Onboarding Academy')
@Controller('api/v1/training')
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  @Get('courses')
  @ApiOperation({ summary: 'Get all video learning courses and microlearning modules' })
  async getCourses() {
    return this.trainingService.getCourses();
  }

  @Get('courses/:id')
  @ApiOperation({ summary: 'Get specific training course with video chapters & takeaways' })
  async getCourseById(@Param('id') id: string) {
    return this.trainingService.getCourseById(id);
  }

  @Get('quiz')
  @ApiOperation({ summary: 'Get randomized 5S competency quiz questions' })
  async getQuizQuestions() {
    return this.trainingService.getQuizQuestions();
  }

  @Post('quiz/submit')
  @ApiOperation({ summary: 'Submit answers for 5S certification quiz and generate certificate' })
  async submitQuiz(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: SubmitQuizDto,
  ) {
    return this.trainingService.submitQuiz(dto, tenantId || 'skilglobal-mfg');
  }

  @Get('certificate/:id')
  @ApiOperation({ summary: 'Verify and retrieve issued 5S Practitioner Certificate' })
  async getCertificate(@Param('id') id: string) {
    return this.trainingService.getCertificate(id);
  }
}
