import { IsString, IsNotEmpty, IsOptional, IsInt, IsBoolean, IsIn, Matches, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { values } from '../../../core/validation/domain-values';
import { NODE_TYPE_CODE_REGEX } from '../node-types';

/** Node types come from the tenant's hierarchy levels (checked by the service); the DTO checks the code format. */
const NODE_TYPE_MESSAGE = 'nodeType must be an upper-case code such as PLANT or BUSINESS_UNIT';

export class CreateOrgNodeDto {
  @ApiPropertyOptional({ example: 'parent-node-uuid' })
  @IsString()
  @IsOptional()
  parentId?: string;

  @ApiProperty({ example: 'High-Bay Storage Rack A1' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'RACK-A1' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    example: 'STORAGE_RACK',
    description: "One of the organization's hierarchy levels (GET /organization/node-types)",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(NODE_TYPE_CODE_REGEX, { message: NODE_TYPE_MESSAGE })
  nodeType: string;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({ example: true, description: 'Automatically register an auditable 5S Area Master in Location Directory' })
  @IsBoolean()
  @IsOptional()
  autoCreateLocation?: boolean;

  @ApiPropertyOptional({ example: 'WAREHOUSE_BAY', enum: values('LOCATION_TYPES') })
  @IsString()
  @IsOptional()
  @IsIn(values('LOCATION_TYPES'))
  locationType?: string;

  @ApiPropertyOptional({ example: 'MEDIUM', enum: values('RISK_LEVELS') })
  @IsString()
  @IsOptional()
  @IsIn(values('RISK_LEVELS'))
  riskLevel?: string;

  @ApiPropertyOptional({ example: 'WEEKLY', enum: values('AUDIT_FREQUENCIES') })
  @IsString()
  @IsOptional()
  @IsIn(values('AUDIT_FREQUENCIES'))
  auditFrequency?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  ownerId?: string;

  @ApiPropertyOptional({ example: 'Building A' })
  @IsString()
  @IsOptional()
  building?: string;

  @ApiPropertyOptional({ example: 'Ground Floor' })
  @IsString()
  @IsOptional()
  floor?: string;

  @ApiPropertyOptional({ example: 'Designated component storage rack for feeder line' })
  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateOrgNodeDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ description: "One of the organization's hierarchy levels (GET /organization/node-types)" })
  @IsString()
  @IsOptional()
  @Matches(NODE_TYPE_CODE_REGEX, { message: NODE_TYPE_MESSAGE })
  nodeType?: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({ enum: values('ORG_NODE_STATUSES') })
  @IsString()
  @IsOptional()
  @IsIn(values('ORG_NODE_STATUSES'))
  status?: string;
}

export class MoveOrgNodeDto {
  @ApiPropertyOptional({ example: 'new-parent-node-uuid', nullable: true, description: 'Omit or send null to move the node to the top level' })
  @IsString()
  @IsOptional()
  newParentId?: string | null;
}
