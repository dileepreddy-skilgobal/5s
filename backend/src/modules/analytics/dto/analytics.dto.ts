import { IsString, IsNotEmpty, IsIn, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { values } from '../../../core/validation/domain-values';

/** POST /analytics/gamification/award-trophy */
export class AwardTrophyDto {
  @ApiProperty({ example: 'GOLDEN_BROOM', enum: values('TROPHY_KEYS') })
  @IsIn(values('TROPHY_KEYS'))
  trophyId: string;

  @ApiProperty({ example: 'location-uuid' })
  @IsString()
  @IsNotEmpty()
  newLocationId: string;

  @ApiProperty({ example: 'Recognized for top 5S workplace performance and sustained visual order.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  citation: string;
}

/** POST /analytics/gamification/kudos — the sender is the signed-in user and the XP is fixed server-side. */
export class GiveKudosDto {
  @ApiProperty({ example: 'user-uuid', description: 'Recipient user id (same tenant, not yourself)' })
  @IsUUID()
  toUserId: string;

  @ApiProperty({ example: 'KAIZEN_INNOVATION', enum: values('KUDOS_CATEGORIES') })
  @IsIn(values('KUDOS_CATEGORIES'))
  category: string;

  @ApiProperty({ example: 'Thanks for the shadow-board redesign on Line 3!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message: string;
}
