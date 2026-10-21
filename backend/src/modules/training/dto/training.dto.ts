import { IsString, IsNotEmpty, IsObject, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitQuizDto {
  /**
   * Question id -> the text of the chosen option. Options are shuffled on every attempt, so answers are
   * matched by text rather than by position. The certificate goes to the signed-in user.
   */
  @ApiProperty({ example: { q1: 'Attach a Red Tag, log the item and move it to the Red Tag holding area.' } })
  @IsObject()
  @IsNotEmpty()
  answers: Record<string, string>;
}

export class UpdateLessonProgressDto {
  @ApiProperty({ example: 'course-5s-foundations' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  courseId: string;

  @ApiProperty({ example: 'foundations-sort' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lessonId: string;

  @ApiProperty({ example: true, description: 'true marks the lesson done, false marks it not done' })
  @IsBoolean()
  completed: boolean;
}
