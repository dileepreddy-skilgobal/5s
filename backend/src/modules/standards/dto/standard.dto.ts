import { IsString, IsNotEmpty, IsOptional, IsArray, IsIn, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { values } from '../../../core/validation/domain-values';

const REFERENCE_PHOTO_TYPES = ['STANDARD_CONDITION', 'CURRENT_CONDITION'];

export class ReferencePhotoDto {
  @ApiProperty({ example: 'STANDARD_CONDITION', enum: REFERENCE_PHOTO_TYPES })
  @IsString()
  @IsIn(REFERENCE_PHOTO_TYPES)
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

  @ApiProperty({ example: 'S2_SET_IN_ORDER', enum: values('FIVE_S_CATEGORIES') })
  @IsString()
  @IsNotEmpty()
  @IsIn(values('FIVE_S_CATEGORIES'))
  category: string;

  @ApiPropertyOptional({ example: 'GLOBAL', enum: values('STANDARD_SCOPES') })
  @IsString()
  @IsOptional()
  @IsIn(values('STANDARD_SCOPES'))
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
  @IsString({ each: true })
  rules: string[];

  @ApiPropertyOptional({ type: [ReferencePhotoDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferencePhotoDto)
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

/**
 * PATCH /standards/:id - standard metadata and scope; all optional. Rules/photos change through revisions.
 * `targetOrgNodeId` / `targetLocationId` may be sent as null to clear the scope target.
 */
export class UpdateStandardDto {
  @ApiPropertyOptional({ example: 'CNC Machine Tooling & Shadow Board Standard' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ example: 'S2_SET_IN_ORDER', enum: values('FIVE_S_CATEGORIES') })
  @IsString()
  @IsOptional()
  @IsIn(values('FIVE_S_CATEGORIES'))
  category?: string;

  @ApiPropertyOptional({ example: 'GLOBAL', enum: values('STANDARD_SCOPES') })
  @IsString()
  @IsOptional()
  @IsIn(values('STANDARD_SCOPES'))
  scopeType?: string;

  @ApiPropertyOptional({ example: 'org-node-uuid', nullable: true })
  @IsString()
  @IsOptional()
  targetOrgNodeId?: string | null;

  @ApiPropertyOptional({ example: 'location-uuid', nullable: true })
  @IsString()
  @IsOptional()
  targetLocationId?: string | null;

  @ApiPropertyOptional({ example: 'PUBLISHED', enum: values('STANDARD_STATUSES') })
  @IsString()
  @IsOptional()
  @IsIn(values('STANDARD_STATUSES'))
  status?: string;
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
  @IsString({ each: true })
  rules: string[];

  @ApiPropertyOptional({ type: [ReferencePhotoDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferencePhotoDto)
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
  @MaxLength(2000)
  comments?: string;
}

/** POST /standards/:id/revisions/:revisionId/reject - the reason is shown to the author. */
export class RejectRevisionDto {
  @ApiProperty({ example: 'The defect photo does not show the current shadow board layout.' })
  @IsString()
  @IsNotEmpty({ message: 'Give the reason for rejecting the revision' })
  @MaxLength(2000)
  reason: string;
}
