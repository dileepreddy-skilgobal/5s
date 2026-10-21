import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() emailNotifications?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() pushNotifications?: boolean;
}

export class RegisterPushDeviceDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString()
  @MaxLength(200)
  @Matches(/^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/, { message: 'token must be an Expo push token' })
  token: string;

  @ApiProperty({ enum: ['ios', 'android'] })
  @IsIn(['ios', 'android'])
  platform: string;
}
