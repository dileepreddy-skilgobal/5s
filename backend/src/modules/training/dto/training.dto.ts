import { IsString, IsNotEmpty, IsArray, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitQuizDto {
  @ApiProperty({ example: { q1: 0, q2: 2, q3: 1 } })
  @IsNotEmpty()
  answers: Record<string, number>;

  @ApiPropertyOptional({ example: 'Pooja Sharma' })
  @IsString()
  @IsOptional()
  traineeName?: string;

  @ApiPropertyOptional({ example: 'admin@skilglobal.com' })
  @IsString()
  @IsOptional()
  traineeEmail?: string;
}

export class TrackLessonProgressDto {
  @ApiProperty({ example: 'course-01' })
  @IsString()
  @IsNotEmpty()
  courseId: string;

  @ApiProperty({ example: 'lesson-01' })
  @IsString()
  @IsNotEmpty()
  lessonId: string;

  @ApiPropertyOptional({ example: 100 })
  @IsNumber()
  @IsOptional()
  progressPercent?: number;
}
