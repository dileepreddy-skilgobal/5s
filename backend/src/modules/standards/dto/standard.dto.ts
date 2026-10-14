import { IsString, IsNotEmpty, IsOptional, IsArray, IsBoolean, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReferencePhotoDto {
  @ApiProperty({ example: 'STANDARD_CONDITION', enum: ['STANDARD_CONDITION', 'CURRENT_CONDITION'] })
  @IsString()
  type: string;

  @ApiProperty({ example: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158' })
  @IsString()
  photoUrl: string;

  @ApiPropertyOptional({ example: 'Front View (Eye Level)' })
  @IsString()
  @IsOptional()
  label?: string;

  @ApiPropertyOptional({ example: 'Tool shadow board with all designated wrenches returned' })
  @IsString()
  @IsOptional()
  description?: string;
}

export class CreateStandardDto {
  @ApiProperty({ example: 'STD-5S-MACH-01' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'CNC Machine Tooling & Shadow Board Standard' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'S2_SET_IN_ORDER', enum: ['S1_SORT', 'S2_SET_IN_ORDER', 'S3_SHINE', 'S4_STANDARDIZE', 'S5_SUSTAIN', 'S6_SAFETY'] })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ example: 'GLOBAL', enum: ['GLOBAL', 'PLANT', 'DEPARTMENT', 'LOCATION_TYPE', 'SPECIFIC_LOCATION'] })
  @IsString()
  @IsOptional()
  scopeType?: string;

  @ApiPropertyOptional({ example: 'org-node-uuid' })
  @IsString()
  @IsOptional()
  targetOrgNodeId?: string;

  @ApiPropertyOptional({ example: 'location-uuid' })
  @IsString()
  @IsOptional()
  targetLocationId?: string;

  @ApiProperty({ example: 'Mandatory workplace standard for tool storage and shadow foam cutouts.' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    example: [
      'Tool must be stored in designated labelled position.',
      'Shadow board foam cutout must match physical tool outline.',
      'No missing tools allowed at end of shift.',
      'Broken or worn tools prohibited.',
      'Maximum quantity of torque wrenches: 2.',
    ],
  })
  @IsArray()
  rules: string[];

  @ApiPropertyOptional()
  @IsArray()
  @IsOptional()
  referencePhotos?: ReferencePhotoDto[];

  @ApiPropertyOptional({ example: 'https://youtube.com/watch?v=sample' })
  @IsString()
  @IsOptional()
  videoUrl?: string;

  @ApiPropertyOptional({ example: 'https://storage.5s-saas.com/standards/sop-001.pdf' })
  @IsString()
  @IsOptional()
  sopDocumentUrl?: string;
}

export class CreateRevisionDto {
  @ApiProperty({ example: '1.1' })
  @IsString()
  @IsNotEmpty()
  revisionNumber: string;

  @ApiProperty({ example: 'Updated shadow board rules to include color-coded metric sockets.' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    example: [
      'Tool must be stored in designated labelled position.',
      'Shadow board foam cutout must match physical tool outline.',
      'Metric sockets must follow blue color coding.',
    ],
  })
  @IsArray()
  rules: string[];

  @ApiPropertyOptional()
  @IsArray()
  @IsOptional()
  referencePhotos?: ReferencePhotoDto[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  videoUrl?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  sopDocumentUrl?: string;

  @ApiPropertyOptional({ example: 'Periodic annual review update' })
  @IsString()
  @IsOptional()
  revisionComments?: string;
}

export class ApproveRevisionDto {
  @ApiPropertyOptional({ example: 'Approved for facility-wide rollout' })
  @IsString()
  @IsOptional()
  comments?: string;
}
