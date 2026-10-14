import { IsString, IsNotEmpty, IsOptional, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
    enum: [
      'ENTERPRISE',
      'PLANT',
      'DIVISION',
      'DEPARTMENT',
      'SUB_DEPARTMENT',
      'PRODUCTION_LINE',
      'WORK_CELL',
      'BAY_STATION',
      'STORAGE_RACK',
      'WORKBENCH',
      'SUB_SECTION',
      'QUARANTINE_ZONE',
    ],
  })
  @IsString()
  @IsNotEmpty()
  nodeType: string;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({ example: true, description: 'Automatically register an auditable 5S Area Master in Location Directory' })
  @IsOptional()
  autoCreateLocation?: boolean;

  @ApiPropertyOptional({ example: 'WAREHOUSE_BAY' })
  @IsString()
  @IsOptional()
  locationType?: string;

  @ApiPropertyOptional({ example: 'MEDIUM' })
  @IsString()
  @IsOptional()
  riskLevel?: string;

  @ApiPropertyOptional({ example: 'WEEKLY' })
  @IsString()
  @IsOptional()
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

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  nodeType?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsString()
  @IsOptional()
  status?: string;
}

export class MoveOrgNodeDto {
  @ApiProperty({ example: 'new-parent-node-uuid' })
  @IsString()
  @IsNotEmpty()
  newParentId: string;
}
